import { Controller, Get, Inject } from "@nestjs/common";
import { HealthService } from "./health.service";
import type { LivenessReport, ReadinessReport } from "./health.service";

@Controller("health")
export class HealthController {
  // Jeton explicite : le type seul ne suffit pas au runtime, et l'import
  // doit rester une valeur (emitDecoratorMetadata) — cf. TS-4 du doc 04.
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get()
  liveness(): LivenessReport {
    return this.health.liveness();
  }

  @Get("ready")
  readiness(): ReadinessReport {
    return this.health.readiness();
  }
}
