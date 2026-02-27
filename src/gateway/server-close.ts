import type { Server as HttpServer } from "node:http";
import process from "node:process";
import type { WebSocketServer } from "ws";
import type { CanvasHostHandler, CanvasHostServer } from "../canvas-host/server.js";
import { type ChannelId, listChannelPlugins } from "../channels/plugins/index.js";
import { stopGmailWatcher } from "../hooks/gmail-watcher.js";
import { logServiceCrash } from "../infra/crash-logger.js";
import type { HeartbeatRunner } from "../infra/heartbeat-runner.js";
import type { PluginServicesHandle } from "../plugins/services.js";

// Module-level timer tracking for resource cleanup validation
const activeTimers = new Set<NodeJS.Timeout>();

/**
 * Register a timer for tracking. Call this when creating setInterval/setTimeout.
 * Returns the timer handle for use with clearInterval/clearTimeout.
 */
export function registerTimer<T extends NodeJS.Timeout>(timer: T): T {
  activeTimers.add(timer);
  return timer;
}

/**
 * Clear a timer and remove from tracking set.
 * Idempotent — safe to call multiple times.
 */
export function clearTimer(timer: NodeJS.Timeout | null | undefined): void {
  if (!timer) {
    return;
  }
  clearInterval(timer);
  activeTimers.delete(timer);
}

// Install process.on('exit') handler for crash logging
let exitHandlerInstalled = false;

function installExitHandler(): void {
  if (exitHandlerInstalled) {
    return;
  }
  exitHandlerInstalled = true;

  process.on("exit", (code) => {
    logServiceCrash({
      serviceName: "gateway",
      exitCode: code,
      signal: process.env.SHUTDOWN_SIGNAL ?? null,
      restartAttempt: Number.parseInt(process.env.LAUNCHD_RESTART_COUNT ?? "0", 10),
    });
  });
}

// Install exit handler on module load
installExitHandler();

export function createGatewayCloseHandler(params: {
  bonjourStop: (() => Promise<void>) | null;
  tailscaleCleanup: (() => Promise<void>) | null;
  canvasHost: CanvasHostHandler | null;
  canvasHostServer: CanvasHostServer | null;
  stopChannel: (name: ChannelId, accountId?: string) => Promise<void>;
  pluginServices: PluginServicesHandle | null;
  cron: { stop: () => void };
  heartbeatRunner: HeartbeatRunner;
  updateCheckStop?: (() => void) | null;
  nodePresenceTimers: Map<string, ReturnType<typeof setInterval>>;
  broadcast: (event: string, payload: unknown, opts?: { dropIfSlow?: boolean }) => void;
  tickInterval: ReturnType<typeof setInterval>;
  healthInterval: ReturnType<typeof setInterval>;
  dedupeCleanup: ReturnType<typeof setInterval>;
  agentUnsub: (() => void) | null;
  heartbeatUnsub: (() => void) | null;
  chatRunState: { clear: () => void };
  clients: Set<{ socket: { close: (code: number, reason: string) => void } }>;
  configReloader: { stop: () => Promise<void> };
  browserControl: { stop: () => Promise<void> } | null;
  wss: WebSocketServer;
  httpServer: HttpServer;
  httpServers?: HttpServer[];
}) {
  return async (opts?: { reason?: string; restartExpectedMs?: number | null }) => {
    const reasonRaw = typeof opts?.reason === "string" ? opts.reason.trim() : "";
    const reason = reasonRaw || "gateway stopping";
    const restartExpectedMs =
      typeof opts?.restartExpectedMs === "number" && Number.isFinite(opts.restartExpectedMs)
        ? Math.max(0, Math.floor(opts.restartExpectedMs))
        : null;
    if (params.bonjourStop) {
      try {
        await params.bonjourStop();
      } catch {
        /* ignore */
      }
    }
    if (params.tailscaleCleanup) {
      await params.tailscaleCleanup();
    }
    if (params.canvasHost) {
      try {
        await params.canvasHost.close();
      } catch {
        /* ignore */
      }
    }
    if (params.canvasHostServer) {
      try {
        await params.canvasHostServer.close();
      } catch {
        /* ignore */
      }
    }
    for (const plugin of listChannelPlugins()) {
      await params.stopChannel(plugin.id);
    }
    if (params.pluginServices) {
      await params.pluginServices.stop().catch(() => {});
    }
    await stopGmailWatcher();
    params.cron.stop();
    params.heartbeatRunner.stop();
    try {
      params.updateCheckStop?.();
    } catch {
      /* ignore */
    }
    for (const timer of params.nodePresenceTimers.values()) {
      clearInterval(timer);
    }
    params.nodePresenceTimers.clear();
    params.broadcast("shutdown", {
      reason,
      restartExpectedMs,
    });
    clearInterval(params.tickInterval);
    clearInterval(params.healthInterval);
    clearInterval(params.dedupeCleanup);

    // Clear all tracked timers to prevent resource leaks
    for (const timer of activeTimers) {
      clearInterval(timer);
    }
    activeTimers.clear();
    if (params.agentUnsub) {
      try {
        params.agentUnsub();
      } catch {
        /* ignore */
      }
    }
    if (params.heartbeatUnsub) {
      try {
        params.heartbeatUnsub();
      } catch {
        /* ignore */
      }
    }
    params.chatRunState.clear();
    for (const c of params.clients) {
      try {
        c.socket.close(1012, "service restart");
      } catch {
        /* ignore */
      }
    }
    params.clients.clear();
    await params.configReloader.stop().catch(() => {});
    if (params.browserControl) {
      await params.browserControl.stop().catch(() => {});
    }
    await new Promise<void>((resolve) => params.wss.close(() => resolve()));
    const servers =
      params.httpServers && params.httpServers.length > 0
        ? params.httpServers
        : [params.httpServer];
    for (const server of servers) {
      const httpServer = server as HttpServer & {
        closeIdleConnections?: () => void;
      };
      if (typeof httpServer.closeIdleConnections === "function") {
        httpServer.closeIdleConnections();
      }
      await new Promise<void>((resolve, reject) =>
        httpServer.close((err) => (err ? reject(err) : resolve())),
      );
    }
  };
}
