/**
 * Alert dispatcher for PAIOS monitoring and alerting system.
 *
 * Sends notifications for crashes, failures, and credential expiry via
 * macOS notifications, console logs, and observability database.
 */

import { join } from "node:path";
import notifier from "node-notifier";
import { checkSystemHealth } from "./health-check.js";

// ── Type Definitions ──────────────────────────────────────────────────

export enum AlertLevel {
  INFO = "info", // FYI notifications (daily reports)
  WARNING = "warning", // Degraded state, non-critical
  CRITICAL = "critical", // Service down, config invalid
}

export enum AlertChannel {
  NOTIFICATION = "notification", // macOS notification (node-notifier)
  LOG = "log", // Console log only
  OBSERVABILITY = "observability", // Log to observability.sqlite
}

export interface AlertMessage {
  level: AlertLevel;
  title: string;
  message: string;
  source: string; // Component that triggered alert
  metadata?: Record<string, unknown>;
}

export interface IntegrationFailure {
  errorType: string;
  count: number;
  lastSeen: string;
}

// ── Constants ─────────────────────────────────────────────────────────

const FAILURE_THRESHOLD = 5; // Dispatch CRITICAL alert if same error occurs 5+ times in 1 hour

// ── Alert Dispatch ────────────────────────────────────────────────────

/**
 * Dispatch alert to specified channels.
 * Never throws - falls back to LOG if other channels fail.
 */
export async function dispatchAlert(alert: AlertMessage, channels: AlertChannel[]): Promise<void> {
  const handlers: Promise<void>[] = [];

  for (const channel of channels) {
    switch (channel) {
      case AlertChannel.NOTIFICATION:
        handlers.push(sendNotification(alert));
        break;
      case AlertChannel.LOG:
        logToConsole(alert);
        break;
      case AlertChannel.OBSERVABILITY:
        handlers.push(logToObservability(alert));
        break;
    }
  }

  // Wait for all async handlers, but don't throw on failure
  await Promise.allSettled(handlers);
}

/**
 * Send macOS notification via node-notifier.
 * Falls back to LOG on failure.
 */
async function sendNotification(alert: AlertMessage): Promise<void> {
  try {
    const options: notifier.Notification = {
      title: alert.title,
      message: alert.message,
      sound: alert.level !== AlertLevel.INFO,
      timeout: alert.level === AlertLevel.INFO ? 5 : 10,
    };

    // CRITICAL alerts are persistent with action button
    if (alert.level === AlertLevel.CRITICAL) {
      options.wait = true;
      options.actions = ["View Logs"];
    }

    notifier.notify(options);
  } catch (err) {
    console.error("[alert-dispatcher] Notification failed, falling back to LOG:", err);
    logToConsole(alert);
  }
}

/**
 * Log alert to console with appropriate severity.
 */
function logToConsole(alert: AlertMessage): void {
  const prefix = `[alert-dispatcher][${alert.level.toUpperCase()}][${alert.source}]`;
  const message = `${alert.title}: ${alert.message}`;

  switch (alert.level) {
    case AlertLevel.INFO:
      console.log(prefix, message);
      break;
    case AlertLevel.WARNING:
      console.warn(prefix, message);
      break;
    case AlertLevel.CRITICAL:
      console.error(prefix, message);
      break;
  }
}

/**
 * Log alert to observability.sqlite events table.
 * Gracefully degrades if database unavailable.
 */
async function logToObservability(alert: AlertMessage): Promise<void> {
  try {
    const dbPath = join(process.env.HOME ?? "/tmp", ".openclaw", "observability.sqlite");

    const { default: Database } = await import("better-sqlite3");
    const db = new Database(dbPath);
    db.pragma("busy_timeout = 5000");

    const metadata = {
      level: alert.level,
      title: alert.title,
      source: alert.source,
      ...alert.metadata,
    };

    const stmt = db.prepare(`
      INSERT INTO events (trace_id, timestamp, category, action, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      `alert-${Date.now()}`,
      new Date().toISOString(),
      "monitoring",
      "alert_dispatched",
      JSON.stringify(metadata),
    );

    db.close();
  } catch (err) {
    // Graceful degradation: log to stderr but don't crash
    console.error(
      "[alert-dispatcher] Failed to log to observability.sqlite:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ── Integration Failure Detection ─────────────────────────────────────

/**
 * Detect integration failures by querying observability events.
 * Returns summary of recent errors grouped by type.
 */
export async function detectIntegrationFailures(): Promise<IntegrationFailure[]> {
  try {
    const dbPath = join(process.env.HOME ?? "/tmp", ".openclaw", "observability.sqlite");

    const { default: Database } = await import("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    db.pragma("busy_timeout = 5000");

    // Query recent errors (last 1 hour)
    const stmt = db.prepare(`
      SELECT error, timestamp
      FROM events
      WHERE category IN ('mcp', 'sdk', 'integration')
        AND error IS NOT NULL
        AND timestamp > datetime('now', '-1 hour')
      ORDER BY timestamp DESC
    `);

    const rows = stmt.all() as Array<{ error: string; timestamp: string }>;
    db.close();

    // Group by error type and count occurrences
    const errorCounts = new Map<string, { count: number; lastSeen: string }>();

    for (const row of rows) {
      const existing = errorCounts.get(row.error);
      if (existing) {
        existing.count++;
        // Keep most recent timestamp
        if (row.timestamp > existing.lastSeen) {
          existing.lastSeen = row.timestamp;
        }
      } else {
        errorCounts.set(row.error, { count: 1, lastSeen: row.timestamp });
      }
    }

    // Convert to array and filter by threshold
    const failures: IntegrationFailure[] = [];
    for (const [errorType, data] of errorCounts) {
      if (data.count >= FAILURE_THRESHOLD) {
        failures.push({
          errorType,
          count: data.count,
          lastSeen: data.lastSeen,
        });
      }
    }

    return failures;
  } catch (err) {
    console.error("[alert-dispatcher] Failed to detect integration failures:", err);
    return []; // Return empty array on failure
  }
}

// ── Daily Health Summary ──────────────────────────────────────────────

/**
 * Generate daily health summary AlertMessage.
 * Runs checkSystemHealth and formats results into notification-friendly summary.
 */
export async function generateDailySummary(): Promise<AlertMessage> {
  try {
    const report = await checkSystemHealth();

    // Count statuses
    const servicesRunning = report.services.filter((s) => s.running).length;
    const servicesTotal = report.services.length;

    const apisAvailable = report.apis.filter((a) => a.available).length;
    const apisTotal = report.apis.length;

    const configsValid = report.configs.filter((c) => c.valid).length;
    const configsTotal = report.configs.length;

    // Format summary message
    const message = [
      `${servicesRunning}/${servicesTotal} services running`,
      `${apisAvailable}/${apisTotal} APIs available`,
      `${configsValid}/${configsTotal} configs valid`,
    ].join(", ");

    // Determine alert level based on overall status
    let level: AlertLevel;
    switch (report.overall) {
      case "critical":
        level = AlertLevel.CRITICAL;
        break;
      case "degraded":
        level = AlertLevel.WARNING;
        break;
      case "healthy":
        level = AlertLevel.INFO;
        break;
    }

    return {
      level,
      title: `PAIOS Daily Health Report: ${report.overall.toUpperCase()}`,
      message,
      source: "daily-health-check",
      metadata: {
        overall: report.overall,
        timestamp: report.timestamp,
      },
    };
  } catch (err) {
    // If health check fails, return CRITICAL alert
    return {
      level: AlertLevel.CRITICAL,
      title: "PAIOS Health Check Failed",
      message: `Failed to run health check: ${err instanceof Error ? err.message : String(err)}`,
      source: "daily-health-check",
      metadata: {
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
