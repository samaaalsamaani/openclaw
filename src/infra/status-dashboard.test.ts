import { describe, test, expect } from "vitest";
import { renderDashboard } from "./status-dashboard.js";

describe("status-dashboard", () => {
  test("renderDashboard returns formatted string with sections", async () => {
    const output = await renderDashboard();

    expect(output).toContain("PAIOS System Status");
    expect(output).toContain("Overall Health:");
    expect(output).toContain("Services");
    expect(output).toContain("APIs");
    expect(output).toContain("Databases");
    expect(output).toContain("Recent Errors");
    expect(output).toContain("Configs");
  });

  // TODO: Test service section formatting (mock health report)
  // TODO: Test API section with latency display
  // TODO: Test database section with WAL status
  // TODO: Test recent errors section (mock observability query)
  // TODO: Test color coding (healthy vs degraded vs critical)
  // TODO: Test error handling (health check fails)
});
