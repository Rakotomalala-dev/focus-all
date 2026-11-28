import {
  createMemoryStoragePort,
  OFFLINE_COLLECTIONS,
  type OfflineMetaKey,
  type OfflineStoragePort,
  type StoredEntity,
} from "./storage-port";

// Le Web (export Expo) ne charge pas le module natif SQLite : le même miroir
// est persisté dans `localStorage`, avec une clé par collection et par
// métadonnée. Sans stockage navigateur (SSR, mode privé verrouillé), le port
// mémoire garde l'application fonctionnelle pour la session.
const PREFIX = "focus.offline";

function collectionKey(collection: string): string {
  return `${PREFIX}.entities.${collection}`;
}

function metaKey(key: OfflineMetaKey): string {
  return `${PREFIX}.meta.${key}`;
}

export function createWebStoragePort(): OfflineStoragePort {
  if (typeof localStorage === "undefined") {
    return createMemoryStoragePort();
  }

  function isStoredEntity(value: unknown): value is StoredEntity {
    if (typeof value !== "object" || value === null) return false;
    if (!("id" in value) || !("payload" in value)) return false;
    return typeof value.id === "string" && typeof value.payload === "string";
  }

  function readEntities(key: string): readonly StoredEntity[] {
    const raw = localStorage.getItem(key);
    if (raw === null) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isStoredEntity) : [];
    } catch {
      return [];
    }
  }

  function writeJson(key: string, value: unknown): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  return {
    initialize: async () => undefined,

    readCollection: async (collection) => readEntities(collectionKey(collection)),

    replaceCollection: async (collection, entities) => {
      writeJson(collectionKey(collection), entities);
    },

    upsertEntities: async (collection, entities) => {
      const current = readEntities(collectionKey(collection));
      const merged = new Map(current.map((entity) => [entity.id, entity.payload]));
      for (const entity of entities) {
        merged.set(entity.id, entity.payload);
      }
      writeJson(
        collectionKey(collection),
        [...merged.entries()].map(([id, payload]) => ({ id, payload })),
      );
    },

    deleteEntities: async (collection, ids) => {
      const removed = new Set(ids);
      const current = readEntities(collectionKey(collection));
      writeJson(
        collectionKey(collection),
        current.filter((entity) => !removed.has(entity.id)),
      );
    },

    readMeta: async (key) => {
      const value = localStorage.getItem(metaKey(key));
      return value === null ? null : value;
    },

    writeMeta: async (key, value) => {
      if (value === null) {
        localStorage.removeItem(metaKey(key));
        return;
      }
      localStorage.setItem(metaKey(key), value);
    },

    clear: async () => {
      for (const collection of OFFLINE_COLLECTIONS) {
        localStorage.removeItem(collectionKey(collection));
      }
      localStorage.removeItem(metaKey("cursor"));
      localStorage.removeItem(metaKey("lastSyncAt"));
    },
  };
}
