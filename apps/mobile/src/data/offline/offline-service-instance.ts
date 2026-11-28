import { remoteProjectRepository } from "../projects/project-repository-instance";
import { remoteTagRepository } from "../tags/tag-repository-instance";
import { useConnectionStore } from "./connection-store";
import { createOfflineService, type OfflineSyncOutcome } from "./offline-service";
import { offlineStore } from "./offline-store-instance";
import { syncClient } from "./sync-client";

export const offlineService = createOfflineService({
  store: offlineStore,
  sync: syncClient,
  projects: remoteProjectRepository,
  tags: remoteTagRepository,
  now: () => new Date(),
});

// Le bandeau et les réglages lisent l'état via le store : ces deux fonctions
// sont le seul endroit qui traduit un résultat de synchronisation en état UI.
function publish(outcome: OfflineSyncOutcome): OfflineSyncOutcome {
  const { setLastSyncAt, setSyncStatus } = useConnectionStore.getState();
  if (outcome.ok) {
    setLastSyncAt(outcome.result.syncedAt);
    setSyncStatus("idle");
  } else {
    setSyncStatus("error");
  }
  return outcome;
}

export async function synchronizeOfflineState(): Promise<OfflineSyncOutcome> {
  useConnectionStore.getState().setSyncStatus("syncing");
  return publish(await offlineService.synchronize());
}

export async function resetOfflineState(): Promise<OfflineSyncOutcome> {
  useConnectionStore.getState().setSyncStatus("syncing");
  return publish(await offlineService.resetLocalData());
}
