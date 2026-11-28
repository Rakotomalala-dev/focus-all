import {
  projectSchema,
  tagSchema,
  taskSchema,
  type Project,
  type Tag,
  type Task,
} from "@focus/contracts";
import type {
  OfflineCollection,
  OfflineMetaKey,
  OfflineStoragePort,
  StoredEntity,
} from "./storage-port";

// Le miroir local alimente la consultation hors ligne (RF-61) : l'instantané
// `/sync/snapshot` remplace les tâches, les listes de projets et de tags les
// complètent, et `meta` porte le curseur et la date de dernière synchronisation.
// Les payloads sont revalidés à la lecture : une ligne corrompue est comptée et
// ignorée au lieu de casser tout l'écran (RF-64).
export type OfflineSnapshotInput = {
  readonly tasks: readonly Task[];
  readonly projects: readonly Project[];
  readonly tags: readonly Tag[];
  readonly cursor: number;
  readonly syncedAt: string;
};

export type OfflineCacheStatus = {
  readonly cursor: number;
  readonly lastSyncAt: string | null;
  readonly taskCount: number;
  readonly projectCount: number;
  readonly tagCount: number;
  readonly corruptedCount: number;
};

export type OfflineStore = {
  readonly initialize: () => Promise<void>;
  readonly saveSnapshot: (snapshot: OfflineSnapshotInput) => Promise<void>;
  readonly saveTasks: (tasks: readonly Task[]) => Promise<void>;
  readonly removeTasks: (ids: readonly string[]) => Promise<void>;
  readonly readTasks: () => Promise<readonly Task[]>;
  readonly findTask: (id: string) => Promise<Task | null>;
  readonly saveProjects: (projects: readonly Project[]) => Promise<void>;
  readonly readProjects: () => Promise<readonly Project[]>;
  readonly saveTags: (tags: readonly Tag[]) => Promise<void>;
  readonly readTags: () => Promise<readonly Tag[]>;
  readonly readStatus: () => Promise<OfflineCacheStatus>;
  readonly reset: () => Promise<void>;
};

type EntitySchema<T> = {
  readonly safeParse: (
    value: unknown,
  ) => { readonly success: true; readonly data: T } | { readonly success: false };
};

function serialize<T extends { readonly id: string }>(
  values: readonly T[],
): readonly StoredEntity[] {
  return values.map((value) => ({ id: value.id, payload: JSON.stringify(value) }));
}

function deserialize<T>(
  entities: readonly StoredEntity[],
  schema: EntitySchema<T>,
): { readonly values: readonly T[]; readonly corrupted: number } {
  const values: T[] = [];
  let corrupted = 0;

  for (const entity of entities) {
    let raw: unknown;
    try {
      raw = JSON.parse(entity.payload);
    } catch {
      corrupted += 1;
      continue;
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      corrupted += 1;
      continue;
    }
    values.push(parsed.data);
  }

  return { values, corrupted };
}

function parseCursor(value: string | null): number {
  if (value === null) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

export function createOfflineStore(port: OfflineStoragePort): OfflineStore {
  async function writeMeta(key: OfflineMetaKey, value: string | null): Promise<void> {
    await port.writeMeta(key, value);
  }

  async function readCollection<T>(
    collection: OfflineCollection,
    schema: EntitySchema<T>,
  ): Promise<readonly T[]> {
    const entities = await port.readCollection(collection);
    return deserialize(entities, schema).values;
  }

  return {
    initialize: () => port.initialize(),

    saveSnapshot: async (snapshot) => {
      await port.replaceCollection("tasks", serialize(snapshot.tasks));
      await port.replaceCollection("projects", serialize(snapshot.projects));
      await port.replaceCollection("tags", serialize(snapshot.tags));
      await writeMeta("cursor", String(snapshot.cursor));
      await writeMeta("lastSyncAt", snapshot.syncedAt);
    },

    saveTasks: async (tasks) => {
      await port.upsertEntities("tasks", serialize(tasks));
    },

    removeTasks: async (ids) => {
      await port.deleteEntities("tasks", ids);
    },

    readTasks: () => readCollection("tasks", taskSchema),

    findTask: async (id) => {
      const tasks = await readCollection("tasks", taskSchema);
      return tasks.find((task) => task.id === id) ?? null;
    },

    saveProjects: async (projects) => {
      await port.upsertEntities("projects", serialize(projects));
    },

    readProjects: () => readCollection("projects", projectSchema),

    saveTags: async (tags) => {
      await port.upsertEntities("tags", serialize(tags));
    },

    readTags: () => readCollection("tags", tagSchema),

    readStatus: async () => {
      const [taskEntities, projectEntities, tagEntities, cursor, lastSyncAt] =
        await Promise.all([
          port.readCollection("tasks"),
          port.readCollection("projects"),
          port.readCollection("tags"),
          port.readMeta("cursor"),
          port.readMeta("lastSyncAt"),
        ]);
      const tasks = deserialize(taskEntities, taskSchema);
      const projects = deserialize(projectEntities, projectSchema);
      const tags = deserialize(tagEntities, tagSchema);

      return {
        cursor: parseCursor(cursor),
        lastSyncAt,
        taskCount: tasks.values.length,
        projectCount: projects.values.length,
        tagCount: tags.values.length,
        corruptedCount: tasks.corrupted + projects.corrupted + tags.corrupted,
      };
    },

    reset: () => port.clear(),
  };
}
