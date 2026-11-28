import { createOfflineStore, type OfflineStore } from "./offline-store";
import { createMemoryStoragePort } from "./storage-port";

// Résolution par défaut (tests, outils) : Metro choisit
// `offline-store-instance.native.ts` sur mobile et `.web.ts` sur le Web.
export const offlineStore: OfflineStore = createOfflineStore(createMemoryStoragePort());
