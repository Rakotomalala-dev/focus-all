import { Module } from "@nestjs/common";
import { TelemetryController } from "./telemetry.controller";
import { TELEMETRY_REPOSITORY, PrismaTelemetryRepository } from "./telemetry.repository";
import { TelemetryService } from "./telemetry.service";

@Module({
  controllers: [TelemetryController],
  providers: [
    TelemetryService,
    { provide: TELEMETRY_REPOSITORY, useClass: PrismaTelemetryRepository },
  ],
})
export class TelemetryModule {}
