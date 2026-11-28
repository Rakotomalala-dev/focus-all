// Port de persistance du miroir hors ligne (RF-61/RF-64). Le domaine ne
// connaît ni SQLite ni `localStorage` : l'app native utilise `expo-sqlite`
// (lecture seule en M1), le Web un stockage clé/valeur, les tests une Map.
export const OFFLINE_COLLECTIONS = ["tasks", "projects", "tags"] as const;
export type OfflineCollection = (typeof OFFLINE_COLLECTIONS)[number];

export const OFFLINE_META_KEYS = ["cursor", "lastSyncAt", "deviceId"] as const;
export type OfflineMetaKey = (typeof OFFLINE_META_KEYS)[number];

export type StoredEntity = {
  readonly id: string;
  readonly payload: string;
};

export type OfflineStoragePort = {
  /** Ouvre la base et crée le schéma — idempotent, appelé à chaque démarrage. */
  readonly initialize: () => Promise<void>;
  readonly readCollection: (collection: OfflineCollection) => Promise<readonly StoredEntity[]>;
  /** Remplace toute la collection (instantané complet). */
  readonly replaceCollection: (
    collection: OfflineCollection,
    entities: readonly StoredEntity[],
  ) => Promise<void>;
  readonly upsertEntities: (
    collection: OfflineCollection,
    entities: readonly StoredEntity[],
  ) => Promise<void>;
  readonly deleteEntities: (
    collection: OfflineCollection,
    ids: readonly string[],
  ) => Promise<void>;
  readonly readMeta: (key: OfflineMetaKey) => Promise<string | null>;
  readonly writeMeta: (key: OfflineMetaKey, value: string | null) => Promise<void>;
  /**
   * Vide le miroir et les métadonnées de synchronisation. `deviceId` est
   * conservé, et une éventuelle outbox (RF-62, V1.1) n'est pas touchée.
   */
  readonly clear: () => Promise<void>;
};

export function createMemoryStoragePort(): OfflineStoragePort {
  const collections = new Map<OfflineCollection, Map<string, string>>();
  const meta = new Map<OfflineMetaKey, string>();

  function collection(name: OfflineCollection): Map<string, string> {
    const existing = collections.get(name);
    if (existing !== undefined) return existing;
    const created = new Map<string, string>();
    collections.set(name, created);
    return created;
  }

  return {
    initialize: async () => undefined,

    readCollection: async (name) =>
      [...collection(name).entries()].map(([id, payload]) => ({ id, payload })),

    replaceCollection: async (name, entities) => {
      collections.set(name, new Map(entities.map((entity) => [entity.id, entity.payload])));
    },

    upsertEntities: async (name, entities) => {
      const target = collection(name);
      for (const entity of entities) {
        target.set(entity.id, entity.payload);
      }
    },

    deleteEntities: async (name, ids) => {
      const target = collection(name);
      for (const id of ids) {
        target.delete(id);
      }
    },

    readMeta: async (key) => meta.get(key) ?? null,

    writeMeta: async (key, value) => {
      if (value === null) {
        meta.delete(key);
        return;
      }
      meta.set(key, value);
    },

    clear: async () => {
      collections.clear();
      meta.delete("cursor");
      meta.delete("lastSyncAt");
    },
  };
}
