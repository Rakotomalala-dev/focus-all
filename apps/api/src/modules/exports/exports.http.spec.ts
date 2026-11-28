import {
  accountExportSchema,
  authTokensSchema,
  exportJobSchema,
  meResponseSchema,
} from "@focus/contracts";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../../test/helpers/test-api";

// RF-71/RF-72 sur le vrai serveur : job asynchrone, lien signé et consentement.
let api: TestApi;
const emails = new Set<string>();

function emailFor(label: string): string {
  const email = `${label}-${randomUUID()}@focus.local`;
  emails.add(email);
  return email;
}

async function register(email: string) {
  const result = await api.request("/api/v1/auth/register", {
    method: "POST",
    body: { email, password: "mot-de-passe-de-test-2026", displayName: "Export Test" },
  });
  expect(result.status).toBe(201);
  return authTokensSchema.parse(result.body);
}

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  for (const email of emails) {
    await api.deleteAccount(email);
  }
  await api.close();
});

describe("RF-71 — export asynchrone et lien 24 h", () => {
  it("prépare l'export, le télécharge sans session et refuse un jeton invalide", async () => {
    const tokens = await register(emailFor("export-async"));
    const headers = { authorization: `Bearer ${tokens.accessToken}` };

    await api.request("/api/v1/tasks", {
      method: "POST",
      headers,
      body: { title: "Tâche exportée" },
    });

    const started = await api.request("/api/v1/me/export", { method: "POST", headers });
    expect(started.status).toBe(202);
    const job = exportJobSchema.parse(started.body);
    expect(job.status).toBe("PENDING");

    expect(await api.processExports()).toBeGreaterThanOrEqual(1);

    const ready = await api.request(`/api/v1/me/export/${job.id}`, { headers });
    expect(ready.status).toBe(200);
    const readyJob = exportJobSchema.parse(ready.body);
    expect(readyJob.status).toBe("READY");
    expect(readyJob.downloadUrl).not.toBeNull();
    expect(readyJob.expiresAt).not.toBeNull();

    // Le lien signé se suffit à lui-même : aucun en-tête Authorization.
    const downloaded = await api.request(readyJob.downloadUrl ?? "");
    expect(downloaded.status).toBe(200);
    expect(downloaded.contentType).toContain("application/json");
    expect(downloaded.headers.get("content-disposition")).toContain("attachment");
    const payload = accountExportSchema.parse(downloaded.body);
    expect(payload.tasks).toHaveLength(1);

    const forged = await api.request(
      `/api/v1/me/export/${job.id}/download?token=${"x".repeat(40)}`,
    );
    expect(forged.status).toBe(403);
  });

  it("ne laisse pas un autre compte lire le job", async () => {
    const owner = await register(emailFor("export-owner"));
    const other = await register(emailFor("export-other"));
    const created = await api.request("/api/v1/me/export", {
      method: "POST",
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    const job = exportJobSchema.parse(created.body);

    const forbidden = await api.request(`/api/v1/me/export/${job.id}`, {
      headers: { authorization: `Bearer ${other.accessToken}` },
    });
    expect(forbidden.status).toBe(404);
  });
});

describe("RF-72 — télémétrie opt-in", () => {
  it("est désactivée par défaut, s'active par PATCH /me et se désactive", async () => {
    const tokens = await register(emailFor("telemetry"));
    const headers = { authorization: `Bearer ${tokens.accessToken}` };

    const initial = await api.request("/api/v1/me", { headers });
    expect(meResponseSchema.parse(initial.body).telemetryEnabled).toBe(false);

    // Même désactivée, l'endpoint répond 204 sans écrire (contrat stable).
    const ignored = await api.request("/api/v1/telemetry/events", {
      method: "POST",
      headers,
      body: { name: "app_open" },
    });
    expect(ignored.status).toBe(204);

    const enabled = await api.request("/api/v1/me", {
      method: "PATCH",
      headers,
      body: { telemetryEnabled: true },
    });
    expect(meResponseSchema.parse(enabled.body).telemetryEnabled).toBe(true);

    const accepted = await api.request("/api/v1/telemetry/events", {
      method: "POST",
      headers,
      body: { name: "task_created", properties: { source: "quick_add" } },
    });
    expect(accepted.status).toBe(204);

    const disabled = await api.request("/api/v1/me", {
      method: "PATCH",
      headers,
      body: { telemetryEnabled: false },
    });
    expect(meResponseSchema.parse(disabled.body).telemetryEnabled).toBe(false);

    const invalid = await api.request("/api/v1/telemetry/events", {
      method: "POST",
      headers,
      body: { name: "unknown_event" },
    });
    expect(invalid.status).toBe(400);
  });
});
