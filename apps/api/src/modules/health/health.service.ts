import { Injectable } from "@nestjs/common";

export type HealthStatus = "ok" | "degraded";

export type DependencyStatus = "up" | "down" | "not_configured";

export type LivenessReport = {
  readonly status: HealthStatus;
  readonly uptimeSeconds: number;
  readonly timestamp: string;
};

export type ReadinessReport = {
  readonly status: HealthStatus;
  readonly checks: Record<string, DependencyStatus>;
};

// Les dépendances réelles (PostgreSQL, Redis) seront branchées avec leurs
// modules respectifs ; tant qu'elles ne le sont pas, elles restent
// explicitement « not_configured » plutôt que faussement « up ».
const NOT_CONFIGURED_CHECKS: Record<string, DependencyStatus> = {
  database: "not_configured",
  redis: "not_configured",
};

@Injectable()
export class HealthService {
  liveness(): LivenessReport {
    return {
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  readiness(): ReadinessReport {
    const checks = { ...NOT_CONFIGURED_CHECKS };
    const hasFailure = Object.values(checks).includes("down");

    return { status: hasFailure ? "degraded" : "ok", checks };
  }
}
