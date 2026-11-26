import { randomUUID } from "node:crypto";
import {
  syncPullResponseSchema,
  syncPushResponseSchema,
  syncSnapshotResponseSchema,
  type SyncPushResult,
} from "@focus/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startTestApi,
  type HttpResult,
  type TestApi,
  type TestWorkspace,
} from "../../../test/helpers/test-api";

// Tests de convergence (critère de sortie M0) : deux clients nominaux, un
// workspace chacun, le même protocole. Ils poussent, tirent et doivent finir sur
// le même état serveur ; un conflit de version n'écrase jamais silencieusement.
let api: TestApi;
let workspace: TestWorkspace;
let otherWorkspace: TestWorkspace;
let authorization = "";
let otherAuthorization = "";

const ENTITY_ID = randomUUID();
const CREATE_ID = randomUUID();
const UPDATE_ID = randomUUID();
const DELETE_ID = randomUUID();
const STALE_ID = randomUUID();

let cursor = 0;

function request(
  path: string,
  options: { method?: string; body?: unknown; authorization?: string } = {},
): Promise<HttpResult> {
  return api.request(path, {
    ...(options.method === undefined ? {} : { method: options.method }),
    ...(options.body === undefined ? {} : { body: options.body }),
    authorization: options.authorization ?? authorization,
  });
}

async function push(
  mutations: unknown[],
  auth: string = authorization,
): Promise<SyncPushResult[]> {
  const result = await request("/api/v1/sync/push", {
    method: "POST",
    body: { mutations },
    authorization: auth,
  });
  expect(result.status).toBe(200);
  return syncPushResponseSchema.parse(result.body).results;
}

beforeAll(async () => {
  api = await startTestApi();
  workspace = await api.createWorkspace("sync-a");
  otherWorkspace = await api.createWorkspace("sync-b");
  authorization = await api.bearerToken(workspace);
  otherAuthorization = await api.bearerToken(otherWorkspace);
});

afterAll(async () => {
  // Si le démarrage a échoué, `api` est indéfini : le nettoyage ne doit pas
  // masquer l'erreur d'origine.
  await api?.close();
});

describe("push → pull", () => {
  it("applique une création hors ligne et journalise un UPSERT", async () => {
    const [created] = await push([
      {
        clientMutationId: CREATE_ID,
        entityType: "task",
        entityId: ENTITY_ID,
        operation: "CREATE",
        payload: { title: "Créée hors ligne", priority: "HIGH" },
      },
    ]);

    expect(created).toMatchObject({
      clientMutationId: CREATE_ID,
      status: "applied",
      entityId: ENTITY_ID,
      version: 0,
    });
    expect(created?.server).toMatchObject({ id: ENTITY_ID, title: "Créée hors ligne" });
  });

  it("un second client tire le changement complet depuis le curseur zéro", async () => {
    const result = await request("/api/v1/sync/pull?since=0&limit=100");
    expect(result.status).toBe(200);
    const page = syncPullResponseSchema.parse(result.body);

    expect(page.changes).toHaveLength(1);
    expect(page.changes[0]).toMatchObject({
      entityType: "task",
      entityId: ENTITY_ID,
      operation: "UPSERT",
      version: 0,
    });
    expect(page.changes[0]?.payload).toMatchObject({ title: "Créée hors ligne" });
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBe(page.changes[0]?.cursor);
    cursor = page.nextCursor;
  });

  it("applique une mise à jour contrôlée par baseVersion", async () => {
    const [updated] = await push([
      {
        clientMutationId: UPDATE_ID,
        entityType: "task",
        entityId: ENTITY_ID,
        operation: "UPDATE",
        baseVersion: 0,
        payload: { title: "Renommée en ligne", status: "DONE" },
      },
    ]);

    expect(updated).toMatchObject({ status: "applied", version: 1 });
    expect(updated?.server).toMatchObject({ title: "Renommée en ligne", status: "DONE" });
  });

  it("le pull suivant ne renvoie que le nouveau changement", async () => {
    const result = await request(`/api/v1/sync/pull?since=${cursor}&limit=100`);
    const page = syncPullResponseSchema.parse(result.body);

    expect(page.changes).toHaveLength(1);
    expect(page.changes[0]).toMatchObject({ operation: "UPSERT", version: 1 });
    cursor = page.nextCursor;
  });
});

describe("convergence et conflits", () => {
  it("un client en retard reçoit un conflit avec l'état serveur, sans écrasement", async () => {
    const [conflict] = await push([
      {
        clientMutationId: STALE_ID,
        entityType: "task",
        entityId: ENTITY_ID,
        operation: "UPDATE",
        baseVersion: 0,
        payload: { title: "Écrasement tenté" },
      },
    ]);

    expect(conflict).toMatchObject({ status: "conflict", version: 1 });
    expect(conflict?.server).toMatchObject({ title: "Renommée en ligne", version: 1 });

    // Le serveur n'a pas bougé : la divergence est visible, pas silencieuse.
    const page = syncPullResponseSchema.parse(
      (await request(`/api/v1/sync/pull?since=${cursor}&limit=100`)).body,
    );
    expect(page.changes).toHaveLength(0);
  });

  it("rejoue un push idempotent sans créer de second changement", async () => {
    const [duplicate] = await push([
      {
        clientMutationId: UPDATE_ID,
        entityType: "task",
        entityId: ENTITY_ID,
        operation: "UPDATE",
        baseVersion: 0,
        payload: { title: "Renommée en ligne" },
      },
    ]);

    expect(duplicate).toMatchObject({ status: "applied", version: 1 });

    const page = syncPullResponseSchema.parse(
      (await request(`/api/v1/sync/pull?since=${cursor}&limit=100`)).body,
    );
    expect(page.changes).toHaveLength(0);
  });

  it("propage une suppression en tombstone DELETE", async () => {
    const [removed] = await push([
      {
        clientMutationId: DELETE_ID,
        entityType: "task",
        entityId: ENTITY_ID,
        operation: "DELETE",
        baseVersion: 1,
      },
    ]);
    expect(removed).toMatchObject({ status: "applied", version: 2, server: null });

    const page = syncPullResponseSchema.parse(
      (await request(`/api/v1/sync/pull?since=${cursor}&limit=100`)).body,
    );
    expect(page.changes).toHaveLength(1);
    expect(page.changes[0]).toMatchObject({ operation: "DELETE", entityId: ENTITY_ID });
    cursor = page.nextCursor;
  });

  it("exclut la tâche supprimée de l'instantané", async () => {
    const snapshot = syncSnapshotResponseSchema.parse(
      (await request("/api/v1/sync/snapshot")).body,
    );

    expect(snapshot.tasks).toHaveLength(0);
    expect(snapshot.cursor).toBeGreaterThanOrEqual(cursor);
  });

  it("rejette une mutation invalide sans faire échouer le lot", async () => {
    const results = await push([
      {
        clientMutationId: randomUUID(),
        entityType: "task",
        entityId: randomUUID(),
        operation: "CREATE",
        payload: { title: "" },
      },
      {
        clientMutationId: randomUUID(),
        entityType: "task",
        entityId: randomUUID(),
        operation: "CREATE",
        payload: { title: "Valide dans le même lot" },
      },
    ]);

    expect(results[0]).toMatchObject({
      status: "rejected",
      code: "VALIDATION_FAILED",
      reason: "sync.invalid_payload",
    });
    expect(results[1]).toMatchObject({ status: "applied", version: 0 });
  });
});

describe("cloisonnement", () => {
  it("ne laisse pas un workspace voir ni modifier le journal d'un autre", async () => {
    const otherPull = syncPullResponseSchema.parse(
      (
        await request("/api/v1/sync/pull?since=0&limit=100", {
          authorization: otherAuthorization,
        })
      ).body,
    );
    expect(otherPull.changes).toHaveLength(0);

    const [foreign] = await push(
      [
        {
          clientMutationId: randomUUID(),
          entityType: "task",
          entityId: ENTITY_ID,
          operation: "UPDATE",
          baseVersion: 0,
          payload: { title: "intrusion" },
        },
      ],
      otherAuthorization,
    );
    // La tâche de l'autre workspace est indistinguable d'une tâche absente.
    expect(foreign).toMatchObject({ status: "rejected", code: "NOT_FOUND" });
  });
});
