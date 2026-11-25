import { describe, expect, it } from "vitest";
import { HealthService } from "./health.service";

describe("HealthService", () => {
  it("rapporte un statut vivant avec un uptime positif ou nul", () => {
    const report = new HealthService().liveness();

    expect(report.status).toBe("ok");
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(report.timestamp))).toBe(false);
  });

  it("déclare les dépendances non branchées comme not_configured", () => {
    const report = new HealthService().readiness();

    expect(report.status).toBe("ok");
    expect(report.checks.database).toBe("not_configured");
    expect(report.checks.redis).toBe("not_configured");
  });
});
