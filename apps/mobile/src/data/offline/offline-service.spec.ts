import {
  projectSchema,
  syncSnapshotResponseSchema,
  tagSchema,
  taskSchema,
} from "@focus/contracts";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../http/app-error";
import { createOfflineService } from "./offline-service";
import { createOfflineStore } from "./offline-store";
import { createMemoryStoragePort } from "./storage-port";

const NOW = new Date("2026-11-28T12:00:00.000Z");
const SYNCED_AT = "2026-11-28T12:00:00.000Z";

const TASK = taskSchema.parse({
  id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e21",
  title: "Tâche du serveur",
  status: "TODO",
  completedAt: null,
  pinned: false,
  sortOrder: "a0",
  version: 4,
  createdAt: "2026-11-25T09:00:00Z",
  updatedAt: "2026-11-25T09:00:00Z",
});

const PROJECT = projectSchema.parse({
  id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e22",
  name: "Travail",
  color: null,
  description: null,
  sortOrder: "a0",
  archivedAt: null,
  version: 1,
  createdAt: "2026-11-25T09:00:00Z",
  updatedAt: "2026-11-25T09:00:00Z",
});

const TAG = tagSchema.parse({
  id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e23",
  name: "focus",
  color: null,
  createdAt: "2026-11-25T09:00:00Z",
  updatedAt: "2026-11-25T09:00:00Z",
});

function buildService(options: {
  snapshot: () => Promise<unknown>;
  store?: ReturnType<typeof createOfflineStore>;
  projects?: () => Promise<readonly typeof PROJECT[]>;
  tags?: () => Promise<readonly typeof TAG[]>;
}) {
  const store = options.store ?? createOfflineStore(createMemoryStoragePort());
  const sync = {
    snapshot: vi.fn(async () => syncSnapshotResponseSchema.parse(await options.snapshot())),
    pull: vi.fn(async () => ({ changes: [], nextCursor: 0, hasMore: false })),
  };
  const projects = { list: vi.fn(options.projects ?? (async () => [PROJECT] as const)) };
  const tags = { list: vi.fn(options.tags ?? (async () => [TAG] as const)) };
  const service = createOfflineService({
    store,
    sync,
    projects,
    tags,
    now: () => NOW,
  });
  return { service, store, sync, projects, tags };
}

describe("offlineService", () => {
  it("remplace le miroir avec l'instantané et les listes de référence", async () => {
    const { service, store } = buildService({
      snapshot: async () => ({ tasks: [TASK], cursor: 12 }),
    });

    const outcome = await service.synchronize();

    expect(outcome).toEqual({
      ok: true,
      result: { taskCount: 1, projectCount: 1, tagCount: 1, syncedAt: SYNCED_AT },
    });
    expect(await store.readStatus()).toEqual({
      cursor: 12,
      lastSyncAt: SYNCED_AT,
      taskCount: 1,
      projectCount: 1,
      tagCount: 1,
      corruptedCount: 0,
    });
  });

  it("laisse la copie précédente intacte quand l'instantané échoue", async () => {
    const { service, store } = buildService({
      snapshot: async () => ({ tasks: [TASK], cursor: 12 }),
    });
    await service.synchronize();

    const failing = buildService({
      store,
      snapshot: async () => {
        throw new AppError({ isNetworkError: true });
      },
    });
    const outcome = await failing.service.synchronize();

    expect(outcome.ok).toBe(false);
    expect(await store.readStatus()).toMatchObject({
      taskCount: 1,
      lastSyncAt: SYNCED_AT,
    });
  });

  it("réinitialise puis force un instantané complet (RF-64)", async () => {
    const { service, store } = buildService({
      snapshot: async () => ({ tasks: [TASK], cursor: 12 }),
    });
    await service.synchronize();

    const second = {
      ...TASK,
      id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e24",
      title: "Seconde tâche",
    };
    const reset = buildService({
      store,
      snapshot: async () => ({ tasks: [second], cursor: 20 }),
    });
    const outcome = await reset.service.resetLocalData();

    expect(outcome).toEqual({
      ok: true,
      result: { taskCount: 1, projectCount: 1, tagCount: 1, syncedAt: SYNCED_AT },
    });
    const status = await store.readStatus();
    expect(status.cursor).toBe(20);
    expect(await store.readTasks()).toEqual([second]);
  });

  it("signale l'échec d'une réinitialisation hors ligne sans masquer l'erreur", async () => {
    const { service, store } = buildService({
      snapshot: async () => ({ tasks: [TASK], cursor: 12 }),
    });
    await service.synchronize();

    const offline = buildService({
      store,
      snapshot: async () => {
        throw new AppError({ isNetworkError: true });
      },
    });
    const outcome = await offline.service.resetLocalData();

    expect(outcome.ok).toBe(false);
    // La copie a bien été vidée, l'écran doit proposer de réessayer.
    expect(await store.readStatus()).toMatchObject({ taskCount: 0, lastSyncAt: null });
  });
});
