import { describe, test, expect } from "vitest";
import { checkSystemHealth } from "./health-check.js";

describe("health-check", () => {
  test("checkSystemHealth returns HealthReport structure", async () => {
    const report = await checkSystemHealth();

    expect(report).toHaveProperty("timestamp");
    expect(report).toHaveProperty("services");
    expect(report).toHaveProperty("apis");
    expect(report).toHaveProperty("databases");
    expect(report).toHaveProperty("configs");
    expect(report).toHaveProperty("overall");
    expect(["healthy", "degraded", "critical"]).toContain(report.overall);
  });

  // TODO: Test service status detection (mock launchctl output)
  // TODO: Test API health checks (mock fetch responses)
  // TODO: Test database accessibility (mock better-sqlite3)
  // TODO: Test config validation (mock file reads)
  // TODO: Test overall status derivation (critical/degraded/healthy)
  // TODO: Test observability logging (verify events table INSERT)
});
