import { createOfflineStore, type OfflineStore } from "./offline-store";
import { createSqliteStoragePort } from "./sqlite-storage-port";

// Android/iOS : une seule base SQLite pour tout le miroir, ouverte à la
// première lecture (le rendu ne dépend pas d'une initialisation synchrone).
export const offlineStore: OfflineStore = createOfflineStore(createSqliteStoragePort());
