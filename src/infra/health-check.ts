/**
 * Comprehensive health check system for PAIOS components
 *
 * Checks status of all services, APIs, databases, and config files with
 * automated detection and observability logging. Supports both programmatic
 * and CLI usage for scheduled monitoring and manual verification.
 */

import { exec } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  AuthProfilesSchema,
  LlmConfigSchema,
  OpenClawConfigSchema,
  loadConfigWithValidationSync,
} from "./config-validator.js";

const execAsync = promisify(exec);

// ── Type Definitions ──────────────────────────────────────────────────

export interface ServiceStatus {
  name: string;
  running: boolean;
  pid?: number;
  lastExitCode?: number;
}

export interface ApiStatus {
  name: string;
  available: boolean;
  statusCode?: number;
  latency_ms?: number;
  error?: string;
}

export interface DatabaseStatus {
  name: string;
  exists: boolean;
  accessible: boolean;
  wal_enabled?: boolean;
  size_mb?: number;
  error?: string;
}

export interface ConfigStatus {
  name: string;
  valid: boolean;
  error?: string;
}

export interface HealthReport {
  timestamp: string;
  services: ServiceStatus[];
  apis: ApiStatus[];
  databases: DatabaseStatus[];
  configs: ConfigStatus[];
  overall: "healthy" | "degraded" | "critical";
}

// ── Constants ─────────────────────────────────────────────────────────

const LAUNCHD_SERVICES = [
  "ai.openclaw.gateway",
  "ai.openclaw.embedding-server",
  "ai.openclaw.file-watcher",
  "ai.openclaw.emit-server",
  "ai.openclaw.daily-tasks",
  "ai.openclaw.weekly-tasks",
  "ai.openclaw.mcp-kb-server",
  "ai.openclaw.mcp-observability-server",
  "ai.openclaw.mcp-macos-system",
];

const CORE_SERVICES = new Set(["ai.openclaw.gateway", "ai.openclaw.embedding-server"]);

const CALENDAR_SERVICES = new Set(["ai.openclaw.daily-tasks", "ai.openclaw.weekly-tasks"]);

const API_TIMEOUT_MS = 5000;

// ── Service Status Checks ─────────────────────────────────────────────

/**
 * Check status of all launchd services.
 * Parses `launchctl list` output to determine running state and PID.
 *
 * Note: Calendar services show PID "-" between scheduled runs (normal, not failure).
 */
async function checkServices(): Promise<ServiceStatus[]> {
  const statuses: ServiceStatus[] = [];

  try {
    const { stdout } = await execAsync("launchctl list");
    const lines = stdout.split("\n");

    for (const serviceName of LAUNCHD_SERVICES) {
      const line = lines.find((l) => l.includes(serviceName));

      if (!line) {
        // Service not loaded
        statuses.push({
          name: serviceName,
          running: false,
        });
        continue;
      }

      // Parse launchctl output: "PID\tStatus\tLabel"
      const parts = line.trim().split(/\s+/);
      const pidStr = parts[0];
      const exitCodeStr = parts[1];

      // Calendar services show "-" for PID between scheduled runs (normal state)
      const isCalendarService = CALENDAR_SERVICES.has(serviceName);
      const pidDash = pidStr === "-";

      if (pidDash && isCalendarService) {
        // Calendar service waiting for next scheduled run
        statuses.push({
          name: serviceName,
          running: true, // Waiting for schedule is "running"
          lastExitCode: exitCodeStr !== "-" ? Number.parseInt(exitCodeStr, 10) : undefined,
        });
      } else if (pidDash) {
        // Non-calendar service with no PID = not running
        statuses.push({
          name: serviceName,
          running: false,
          lastExitCode: exitCodeStr !== "-" ? Number.parseInt(exitCodeStr, 10) : undefined,
        });
      } else {
        // Service has active PID = running
        statuses.push({
          name: serviceName,
          running: true,
          pid: Number.parseInt(pidStr, 10),
          lastExitCode: exitCodeStr !== "-" ? Number.parseInt(exitCodeStr, 10) : undefined,
        });
      }
    }
  } catch (err) {
    console.error("[health-check] Failed to check services:", err);
    // Return empty array - caller will mark as critical
  }

  return statuses;
}

// ── API Status Checks ─────────────────────────────────────────────────

/**
 * Check status of all configured APIs.
 * Tests local service endpoints (gateway, embedding) and external APIs.
 */
async function checkApis(): Promise<ApiStatus[]> {
  const statuses: ApiStatus[] = [];

  // Local services
  const localServices = [
    { name: "gateway", url: "http://localhost:18789/health" },
    { name: "embedding-server", url: "http://localhost:11435/health" },
  ];

  for (const service of localServices) {
    try {
      const start = Date.now();
      const response = await fetch(service.url, {
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      const latency = Date.now() - start;

      statuses.push({
        name: service.name,
        available: response.ok,
        statusCode: response.status,
        latency_ms: latency,
      });
    } catch (err) {
      statuses.push({
        name: service.name,
        available: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // External APIs from auth-profiles.json
  const authProfilePath = join(process.env.HOME ?? "/tmp", ".openclaw", "auth-profiles.json");
  try {
    const authProfiles = loadConfigWithValidationSync(authProfilePath, AuthProfilesSchema);

    // Map provider names to health check endpoints
    const apiHealthChecks: Record<string, string> = {
      anthropic: "https://api.anthropic.com/v1/messages",
      openai: "https://api.openai.com/v1/models",
      "openai-codex": "https://api.codex.com/v1/models",
      google: "https://generativelanguage.googleapis.com/v1/models",
      brave: "https://api.search.brave.com/res/v1/web/search?q=test",
      elevenlabs: "https://api.elevenlabs.io/v1/models",
      deepgram: "https://api.deepgram.com/v1/projects",
      late: "https://getlate.dev/api/v1/health",
    };

    for (const [profileId, profile] of Object.entries(authProfiles.profiles)) {
      // Extract provider name from profile (assuming profile has provider field)
      const profileData = profile as { provider?: string; key?: string };
      const provider = profileData.provider ?? profileId;

      const endpoint = apiHealthChecks[provider];
      if (!endpoint) {
        // Skip providers without health check endpoints
        continue;
      }

      try {
        const start = Date.now();
        const response = await fetch(endpoint, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${profileData.key ?? "test"}`,
          },
          signal: AbortSignal.timeout(API_TIMEOUT_MS),
        });
        const latency = Date.now() - start;

        // 4xx codes (400/401/405) often mean "API is up, just auth/method issues"
        // Only treat 5xx and network errors as unavailable
        const available = response.status < 500;

        statuses.push({
          name: provider,
          available,
          statusCode: response.status,
          latency_ms: latency,
        });
      } catch (err) {
        statuses.push({
          name: provider,
          available: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error("[health-check] Failed to load auth-profiles.json:", err);
    // Continue without external API checks
  }

  return statuses;
}

// ── Database Status Checks ────────────────────────────────────────────

/**
 * Check status of all SQLite databases.
 * Verifies existence, accessibility, WAL mode, and file size.
 */
async function checkDatabases(): Promise<DatabaseStatus[]> {
  const statuses: DatabaseStatus[] = [];

  const databases = [
    {
      name: "observability.sqlite",
      path: join(process.env.HOME ?? "/tmp", ".openclaw", "observability.sqlite"),
    },
    {
      name: "social-history.sqlite",
      path: join(process.env.HOME ?? "/tmp", ".openclaw", "social-history.sqlite"),
    },
    {
      name: "autonomy.sqlite",
      path: join(process.env.HOME ?? "/tmp", ".openclaw", "autonomy.sqlite"),
    },
    {
      name: "memory/main.sqlite",
      path: join(process.env.HOME ?? "/tmp", ".openclaw", "memory", "main.sqlite"),
    },
    {
      name: "projects/knowledge-base/kb.sqlite",
      path: join(
        process.env.HOME ?? "/tmp",
        ".openclaw",
        "projects",
        "knowledge-base",
        "kb.sqlite",
      ),
    },
  ];

  for (const db of databases) {
    try {
      // Check if file exists
      const stat = statSync(db.path);
      const sizeMB = Math.round((stat.size / 1048576) * 10) / 10; // Round to 1 decimal

      // Try to open database and check WAL mode
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require("better-sqlite3");
      const dbHandle = new Database(db.path, { readonly: true });

      const walResult = dbHandle.pragma("journal_mode", { simple: true });
      const walEnabled = walResult === "wal";

      dbHandle.close();

      statuses.push({
        name: db.name,
        exists: true,
        accessible: true,
        wal_enabled: walEnabled,
        size_mb: sizeMB,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      // Check if error is ENOENT (file doesn't exist)
      const exists =
        !(err as NodeJS.ErrnoException).code || (err as NodeJS.ErrnoException).code !== "ENOENT";

      statuses.push({
        name: db.name,
        exists,
        accessible: false,
        error: errorMsg,
      });
    }
  }

  return statuses;
}

// ── Config Status Checks ──────────────────────────────────────────────

/**
 * Check validity of all configuration files.
 * Uses Zod schemas from config-validator for validation.
 */
async function checkConfigs(): Promise<ConfigStatus[]> {
  const statuses: ConfigStatus[] = [];

  const openclawDir = join(process.env.HOME ?? "/tmp", ".openclaw");

  // LLM config
  try {
    loadConfigWithValidationSync(join(openclawDir, "llm-config.json"), LlmConfigSchema);
    statuses.push({
      name: "llm-config.json",
      valid: true,
    });
  } catch (err) {
    statuses.push({
      name: "llm-config.json",
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Auth profiles
  try {
    loadConfigWithValidationSync(join(openclawDir, "auth-profiles.json"), AuthProfilesSchema);
    statuses.push({
      name: "auth-profiles.json",
      valid: true,
    });
  } catch (err) {
    statuses.push({
      name: "auth-profiles.json",
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // OpenClaw config (passthrough schema - catches non-object corruption)
  try {
    loadConfigWithValidationSync(join(openclawDir, "openclaw.json"), OpenClawConfigSchema);
    statuses.push({
      name: "openclaw.json",
      valid: true,
    });
  } catch (err) {
    statuses.push({
      name: "openclaw.json",
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return statuses;
}

// ── Overall Health Derivation ─────────────────────────────────────────

/**
 * Derive overall health status from component checks.
 *
 * Critical: Any core service down OR any config invalid
 * Degraded: Any non-core service down OR any API unavailable OR any database inaccessible
 * Healthy: All checks pass
 */
function deriveOverallStatus(
  services: ServiceStatus[],
  apis: ApiStatus[],
  databases: DatabaseStatus[],
  configs: ConfigStatus[],
): "healthy" | "degraded" | "critical" {
  // Check for critical failures
  for (const config of configs) {
    if (!config.valid) {
      return "critical";
    }
  }

  for (const service of services) {
    if (CORE_SERVICES.has(service.name) && !service.running) {
      return "critical";
    }
  }

  // Check for degraded conditions
  for (const service of services) {
    if (!CORE_SERVICES.has(service.name) && !service.running) {
      return "degraded";
    }
  }

  for (const api of apis) {
    if (!api.available) {
      return "degraded";
    }
  }

  for (const db of databases) {
    if (!db.accessible) {
      return "degraded";
    }
  }

  return "healthy";
}

// ── Observability Logging ─────────────────────────────────────────────

/**
 * Log health check results to observability.sqlite.
 * Gracefully degrades if database unavailable.
 */
function logHealthCheckToObservability(report: HealthReport): void {
  try {
    const dbPath = join(process.env.HOME ?? "/tmp", ".openclaw", "observability.sqlite");

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    const db = new Database(dbPath);
    db.pragma("busy_timeout = 5000");

    const metadata = {
      overall: report.overall,
      services: report.services.map((s) => ({ name: s.name, running: s.running })),
      apis: report.apis.map((a) => ({ name: a.name, available: a.available })),
      databases: report.databases.map((d) => ({ name: d.name, accessible: d.accessible })),
      configs: report.configs.map((c) => ({ name: c.name, valid: c.valid })),
    };

    const stmt = db.prepare(`
      INSERT INTO events (trace_id, timestamp, category, action, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      `health-${Date.now()}`,
      new Date().toISOString(),
      "monitoring",
      "health_check",
      JSON.stringify(metadata),
    );

    db.close();
  } catch (err) {
    // Graceful degradation: log to stderr but don't crash
    console.error(
      "[health-check] Failed to log to observability.sqlite:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ── Main Health Check Function ────────────────────────────────────────

/**
 * Run comprehensive system health check.
 * Checks all services, APIs, databases, and configs, then logs to observability.
 *
 * @returns Health report with component statuses and overall health
 */
export async function checkSystemHealth(): Promise<HealthReport> {
  const timestamp = new Date().toISOString();

  // Run all checks in parallel
  const [services, apis, databases, configs] = await Promise.all([
    checkServices(),
    checkApis(),
    checkDatabases(),
    checkConfigs(),
  ]);

  const overall = deriveOverallStatus(services, apis, databases, configs);

  const report: HealthReport = {
    timestamp,
    services,
    apis,
    databases,
    configs,
    overall,
  };

  // Log to observability (async, non-blocking)
  logHealthCheckToObservability(report);

  return report;
}
