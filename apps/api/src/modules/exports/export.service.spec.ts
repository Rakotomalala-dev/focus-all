import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";
import { DomainError } from "../../common/domain-error";
import type { AuthContext } from "../auth/auth-context";
import type { AuthService } from "../auth/auth.service";
import type { PushMessage, PushSender } from "../reminders/expo-push.sender";
import {
  ExportService,
  EXPORT_LINK_TTL_MS,
} from "./export.service";
import type {
  ExportData,
  ExportStore,
  StoredExportJob,
} from "./export.repository";

const SECRET = "test-secret-0000000000000000000000000000";
const AUTH: AuthContext = {
  userId: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e91",
  workspaceId: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e92",
};
const OTHER_USER = "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e93";

class MemoryExportStore implements ExportStore {
  readonly jobs = new Map<string, StoredExportJob>();
  data: ExportData = { projects: [{ id: "project-1" }], tasks: [{ id: "task-1" }], tags: [] };
  tokens: readonly string[] = [];

  async create(userId: string, id: string, now: Date): Promise<StoredExportJob> {
    const job: StoredExportJob = {
      id,
      userId,
      status: "PENDING",
      payload: null,
      createdAt: now,
      completedAt: null,
      expiresAt: null,
    };
    this.jobs.set(id, job);
    return job;
  }

  async findForUser(id: string, userId: string): Promise<StoredExportJob | undefined> {
    const job = this.jobs.get(id);
    return job?.userId === userId ? job : undefined;
  }

  async claimNext(): Promise<StoredExportJob | undefined> {
    const job = [...this.jobs.values()].find((candidate) => candidate.status === "PENDING");
    if (job === undefined) {
      return undefined;
    }
    const next: StoredExportJob = { ...job, status: "PROCESSING" };
    this.jobs.set(job.id, next);
    return next;
  }

  async complete(id: string, payload: unknown, expiresAt: Date): Promise<void> {
    const job = this.jobs.get(id);
    if (job === undefined) return;
    this.jobs.set(id, {
      ...job,
      status: "READY",
      payload,
      completedAt: new Date(),
      expiresAt,
    });
  }

  async fail(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (job !== undefined) this.jobs.set(id, { ...job, status: "FAILED" });
  }

  async expire(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (job !== undefined) this.jobs.set(id, { ...job, status: "EXPIRED" });
  }

  async loadData(): Promise<ExportData> {
    return this.data;
  }

  async pushTokens(): Promise<readonly string[]> {
    return this.tokens;
  }
}

class FakePush implements PushSender {
  readonly batches: PushMessage[][] = [];
  shouldFail = false;

  async send(messages: readonly PushMessage[]): Promise<void> {
    if (this.shouldFail) throw new Error("push down");
    this.batches.push([...messages]);
  }
}

function setup() {
  const store = new MemoryExportStore();
  const push = new FakePush();
  const jwt = new JwtService({
    secret: SECRET,
    signOptions: { issuer: "focus-api", audience: "focus-clients" },
  });
  const auth = {
    meForUser: async (userId: string) => ({
      id: userId,
      email: "ada@focus.local",
      displayName: "Ada Lovelace",
      avatarUrl: null,
      timezone: "Europe/Paris",
      locale: "fr" as const,
      weekStartsOn: "MONDAY" as const,
      timeFormat: "H24" as const,
      theme: "SYSTEM" as const,
      quickAddParsingEnabled: true,
      telemetryEnabled: false,
      workspaces: [
        {
          id: AUTH.workspaceId,
          name: "Espace d'Ada",
          isPersonal: true,
          role: "OWNER" as const,
        },
      ],
    }),
  } as Pick<AuthService, "meForUser">;
  const service = new ExportService(
    store,
    auth as AuthService,
    jwt,
    { API_PREFIX: "/api/v1" },
    push,
  );
  return { service, store, push, jwt };
}

describe("ExportService (RF-71)", () => {
  it("crée un job PENDING sans lien", async () => {
    const { service } = setup();

    const job = await service.request(AUTH);

    expect(job.status).toBe("PENDING");
    expect(job.downloadUrl).toBeNull();
  });

  it("prépare l'export, notifie puis expose un lien signé de 24 h", async () => {
    const { service, store, push } = setup();
    store.tokens = ["ExponentPushToken[abc]"];
    const created = await service.request(AUTH);

    expect(await service.processPending()).toBe(1);
    expect(push.batches[0]?.[0]).toMatchObject({
      to: "ExponentPushToken[abc]",
      title: "Votre export est prêt",
    });

    const ready = await service.status(AUTH, created.id);
    expect(ready.status).toBe("READY");
    expect(ready.downloadUrl).toContain(`/api/v1/me/export/${created.id}/download?token=`);
    expect(ready.expiresAt).not.toBeNull();

    const token = new URL(ready.downloadUrl ?? "", "http://localhost").searchParams.get(
      "token",
    );
    const payload = await service.download(created.id, token ?? undefined);
    expect(payload.user.id).toBe(AUTH.userId);
    expect(payload.projects).toEqual([{ id: "project-1" }]);
    expect(payload.tasks).toEqual([{ id: "task-1" }]);
    expect(payload.tags).toEqual([]);
  });

  it("ne révèle pas le job d'un autre utilisateur", async () => {
    const { service } = setup();
    const created = await service.request(AUTH);

    await expect(
      service.status({ ...AUTH, userId: OTHER_USER }, created.id),
    ).rejects.toMatchObject({ messageKey: "export.not_found" });
  });

  it("refuse un lien expiré et marque le job EXPIRED", async () => {
    const { service, store } = setup();
    const created = await service.request(AUTH);
    await service.processPending();
    const job = store.jobs.get(created.id);
    if (job === undefined) throw new Error("job missing");
    store.jobs.set(created.id, {
      ...job,
      expiresAt: new Date(Date.now() - EXPORT_LINK_TTL_MS),
    });

    const expired = await service.status(AUTH, created.id);
    expect(expired.status).toBe("EXPIRED");
    await expect(service.download(created.id, "x".repeat(40))).rejects.toBeInstanceOf(
      DomainError,
    );
  });

  it("refuse un jeton falsifié", async () => {
    const { service } = setup();
    const created = await service.request(AUTH);
    await service.processPending();

    await expect(service.download(created.id, "faux-jeton-de-plus-de-20-caracteres")).rejects.toMatchObject(
      { messageKey: "export.invalid_link" },
    );
  });

  it("marque FAILED si la préparation échoue, sans bloquer la file", async () => {
    const { service, store } = setup();
    const created = await service.request(AUTH);
    store.loadData = async () => {
      throw new Error("db down");
    };

    expect(await service.processPending()).toBe(1);
    expect((await service.status(AUTH, created.id)).status).toBe("FAILED");
  });

  it("ne bloque pas l'export quand le push échoue", async () => {
    const { service, store, push } = setup();
    store.tokens = ["ExponentPushToken[abc]"];
    push.shouldFail = true;
    const created = await service.request(AUTH);

    await service.processPending();

    expect((await service.status(AUTH, created.id)).status).toBe("READY");
  });
});
