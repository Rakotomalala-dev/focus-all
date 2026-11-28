import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { telemetryEventSchema } from "@focus/contracts";
import { describeIssues } from "../../common/zod-issues";
import type { AuthContext } from "../auth/auth-context";
import { TELEMETRY_REPOSITORY, type TelemetryRepository } from "./telemetry.repository";

@Injectable()
export class TelemetryService {
  constructor(
    @Inject(TELEMETRY_REPOSITORY) private readonly repository: TelemetryRepository,
  ) {}

  // RF-72 : sans consentement, l'appel est accepté (204) mais rien n'est écrit.
  // Le client n'a pas besoin de distinguer « refusé » de « envoyé ».
  async record(auth: AuthContext, rawBody: unknown): Promise<void> {
    const parsed = telemetryEventSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }
    if (!(await this.repository.isEnabled(auth.userId))) {
      return;
    }
    await this.repository.record(parsed.data);
  }
}
