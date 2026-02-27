/**
 * Observability database path helper.
 *
 * Provides path to the observability SQLite database for logging events,
 * metrics, and system telemetry.
 */

import * as os from "node:os";
import * as path from "node:path";

/**
 * Get path to observability database.
 *
 * Default location: ~/.openclaw/observability.sqlite
 */
export function getObservabilityDbPath(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, ".openclaw", "observability.sqlite");
}
