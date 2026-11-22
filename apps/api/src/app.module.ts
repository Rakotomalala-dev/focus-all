import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";

// Racine de composition : aucun module métier à ce stade (socle M0).
@Module({
  imports: [HealthModule],
})
export class AppModule {}
