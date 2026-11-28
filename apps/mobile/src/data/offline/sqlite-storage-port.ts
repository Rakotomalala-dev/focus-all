import * as SQLite from "expo-sqlite";
import type { OfflineStoragePort } from "./storage-port";

// Miroir SQLite natif (Android M1). Une table d'entités indexée par collection
// et une table de métadonnées suffisent pour la lecture hors ligne ; les tables
// normalisées (`task_tags`, `reminders`) arrivent avec l'outbox de RF-62.
const DATABASE_NAME = "focus-offline.db";

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS offline_entities (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (collection, id)
);
CREATE TABLE IF NOT EXISTS offline_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT
);
`;

type EntityRow = { readonly id: string; readonly payload: string };
type MetaRow = { readonly value: string | null };

export function createSqliteStoragePort(
  databaseName: string = DATABASE_NAME,
): OfflineStoragePort {
  let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

  function database(): Promise<SQLite.SQLiteDatabase> {
    databasePromise ??= SQLite.openDatabaseAsync(databaseName).then(async (opened) => {
      await opened.execAsync(SCHEMA);
      return opened;
    });
    return databasePromise;
  }

  return {
    initialize: async () => {
      await database();
    },

    readCollection: async (collection) => {
      const opened = await database();
      return opened.getAllAsync<EntityRow>(
        "SELECT id, payload FROM offline_entities WHERE collection = ? ORDER BY id",
        collection,
      );
    },

    replaceCollection: async (collection, entities) => {
      const opened = await database();
      await opened.withTransactionAsync(async () => {
        await opened.runAsync(
          "DELETE FROM offline_entities WHERE collection = ?",
          collection,
        );
        for (const entity of entities) {
          await opened.runAsync(
            "INSERT INTO offline_entities (collection, id, payload) VALUES (?, ?, ?)",
            collection,
            entity.id,
            entity.payload,
          );
        }
      });
    },

    upsertEntities: async (collection, entities) => {
      const opened = await database();
      await opened.withTransactionAsync(async () => {
        for (const entity of entities) {
          await opened.runAsync(
            `INSERT INTO offline_entities (collection, id, payload) VALUES (?, ?, ?)
             ON CONFLICT(collection, id) DO UPDATE SET payload = excluded.payload`,
            collection,
            entity.id,
            entity.payload,
          );
        }
      });
    },

    deleteEntities: async (collection, ids) => {
      const opened = await database();
      await opened.withTransactionAsync(async () => {
        for (const id of ids) {
          await opened.runAsync(
            "DELETE FROM offline_entities WHERE collection = ? AND id = ?",
            collection,
            id,
          );
        }
      });
    },

    readMeta: async (key) => {
      const opened = await database();
      const row = await opened.getFirstAsync<MetaRow>(
        "SELECT value FROM offline_meta WHERE key = ?",
        key,
      );
      return row?.value ?? null;
    },

    writeMeta: async (key, value) => {
      const opened = await database();
      await opened.runAsync(
        `INSERT INTO offline_meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        key,
        value,
      );
    },

    clear: async () => {
      const opened = await database();
      await opened.withTransactionAsync(async () => {
        await opened.runAsync("DELETE FROM offline_entities");
        await opened.runAsync("DELETE FROM offline_meta WHERE key <> 'deviceId'");
      });
    },
  };
}
