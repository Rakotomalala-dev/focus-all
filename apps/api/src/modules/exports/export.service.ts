import { Inject, Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  accountExportSchema,
  exportDownloadQuerySchema,
  uuidSchema,
  type AccountExport,
  type ExportJob,
} from "@focus/contracts";
import { APP_ENV } from "../../config/app-config.module";
import type { Env } from "../../config/env.schema";
import { DomainError } from "../../common/domain-error";
import type { AuthContext } from "../auth/auth-context";
import { AuthService } from "../auth/auth.service";
import { PUSH_SENDER, type PushSender } from "../reminders/expo-push.sender";
import {
  EXPORT_STORE,
  newExportId,
  type ExportStore,
  type StoredExportJob,
} from "./export.repository";

export const EXPORT_LINK_TTL_MS = 24 * 60 * 60 * 1000;
const EXPORT_AUDIENCE = "focus-export";
const EXPORT_KIND = "account-export";

type ExportLinkPayload = {
  readonly sub: string;
  readonly exportId: string;
  readonly kind: string;
};

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    @Inject(EXPORT_STORE) private readonly store: ExportStore,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(APP_ENV) private readonly env: Pick<Env, "API_PREFIX">,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
  ) {}

  async request(auth: AuthContext): Promise<ExportJob> {
    const job = await this.store.create(auth.userId, newExportId(), new Date());
    return this.view(job, null);
  }

  async status(auth: AuthContext, id: string): Promise<ExportJob> {
    if (!uuidSchema.safeParse(id).success) {
      throw new DomainError("export.not_found");
    }
    const job = await this.store.findForUser(id, auth.userId);
    if (job === undefined) {
      throw new DomainError("export.not_found");
    }
    if (job.status === "READY" && job.expiresAt !== null && job.expiresAt <= new Date()) {
      await this.store.expire(job.id);
      return this.view({ ...job, status: "EXPIRED" }, null);
    }
    const downloadUrl =
      job.status === "READY" ? await this.signedDownloadUrl(job.id, job.userId) : null;
    return this.view(job, downloadUrl);
  }

  // Appelé par le worker : une ligne est réclamée atomiquement, donc deux
  // instances ne peuvent pas préparer le même export.
  async processPending(): Promise<number> {
    const job = await this.store.claimNext();
    if (job === undefined) {
      return 0;
    }

    try {
      const user = await this.auth.meForUser(job.userId);
      const data = await this.store.loadData(job.userId);
      const payload = accountExportSchema.parse({
        exportedAt: new Date().toISOString(),
        user,
        workspaces: user.workspaces,
        projects: data.projects,
        tasks: data.tasks,
        tags: data.tags,
      });
      const expiresAt = new Date(Date.now() + EXPORT_LINK_TTL_MS);
      await this.store.complete(job.id, payload, expiresAt);
      await this.notify(job.userId, job.id);
    } catch (error) {
      this.logger.warn(
        `Export ${job.id} en échec: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.store.fail(job.id, "export_failed");
    }
    return 1;
  }

  async download(id: string, token: string | undefined): Promise<AccountExport> {
    const parsed = exportDownloadQuerySchema.safeParse({ token });
    if (!parsed.success) {
      throw new DomainError("export.invalid_link");
    }

    let payload: ExportLinkPayload;
    try {
      payload = await this.jwt.verifyAsync<ExportLinkPayload>(parsed.data.token, {
        audience: EXPORT_AUDIENCE,
      });
    } catch {
      throw new DomainError("export.invalid_link");
    }
    if (payload.kind !== EXPORT_KIND || payload.exportId !== id) {
      throw new DomainError("export.invalid_link");
    }

    const job = await this.store.findForUser(id, payload.sub);
    if (job === undefined) {
      throw new DomainError("export.not_found");
    }
    if (job.status === "EXPIRED" || (job.expiresAt !== null && job.expiresAt <= new Date())) {
      throw new DomainError("export.expired");
    }
    if (job.status !== "READY" || job.payload === null) {
      throw new DomainError("export.not_ready");
    }
    return accountExportSchema.parse(job.payload);
  }

  private async signedDownloadUrl(id: string, userId: string): Promise<string> {
    const token = await this.jwt.signAsync(
      { sub: userId, exportId: id, kind: EXPORT_KIND } satisfies ExportLinkPayload,
      { audience: EXPORT_AUDIENCE, expiresIn: "24h" },
    );
    return `${this.env.API_PREFIX}/me/export/${id}/download?token=${encodeURIComponent(token)}`;
  }

  private view(job: StoredExportJob, downloadUrl: string | null): ExportJob {
    return {
      id: job.id,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
      expiresAt: job.expiresAt?.toISOString() ?? null,
      downloadUrl,
    };
  }

  private async notify(userId: string, exportId: string): Promise<void> {
    const tokens = await this.store.pushTokens(userId);
    if (tokens.length === 0) {
      return;
    }
    try {
      await this.push.send(
        tokens.map((to) => ({
          to,
          title: "Votre export est prêt",
          body: "Le lien de téléchargement est valable 24 h.",
          data: { exportId },
        })),
      );
    } catch (error) {
      // Le push ne conditionne pas la disponibilité de l'export.
      this.logger.warn(
        `Notification d'export impossible (${exportId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
