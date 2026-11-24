import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ProblemDetailsFilter } from "./common/problem-details.filter";
import { HealthModule } from "./health/health.module";

// Racine de composition : aucun module métier à ce stade (socle M0).
@Module({
  imports: [HealthModule],
  // Filtre global : toute exception sort en `application/problem+json` (N-8),
  // y compris depuis les modules ajoutés plus tard.
  providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
})
export class AppModule {}
