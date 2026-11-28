import { createOfflineStore, type OfflineStore } from "./offline-store";
import { createWebStoragePort } from "./web-storage-port";

// Web : même contrat de miroir, persisté en `localStorage` (pas de module
// SQLite natif dans le bundle web).
export const offlineStore: OfflineStore = createOfflineStore(createWebStoragePort());
