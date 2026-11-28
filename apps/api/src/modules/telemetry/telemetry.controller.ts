import { Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import type { AuthContext } from "../auth/auth-context";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { TelemetryService } from "./telemetry.service";

@Controller("telemetry")
export class TelemetryController {
  constructor(@Inject(TelemetryService) private readonly telemetry: TelemetryService) {}

  @Post("events")
  @HttpCode(204)
  record(@CurrentAuth() auth: AuthContext, @Body() body: unknown): Promise<void> {
    return this.telemetry.record(auth, body);
  }
}
