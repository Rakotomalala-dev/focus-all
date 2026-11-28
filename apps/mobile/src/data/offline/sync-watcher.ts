import type { OfflineStore } from "./offline-store";
import type { SyncClient } from "./sync-client";

// RF-60 : rapatrie les changements confirmés depuis le dernier curseur. Le
// polling est volontairement borné (pages de 500) pour ne jamais bloquer
// l'interface sur un journal très en retard ; un instantané complet reste le
// filet de sécurité en cas de corruption.
export const SYNC_POLL_INTERVAL_MS = 2_000;
const MAX_PAGES = 20;

export type PullOutcome = {
  readonly applied: number;
  readonly cursor: number;
  readonly changed: boolean;
  readonly syncedAt: string;
};

export type SyncWatcherDeps = {
  readonly store: OfflineStore;
  readonly sync: Pick<SyncClient, "pull">;
  readonly now: () => Date;
};

export async function pullRemoteChanges(deps: SyncWatcherDeps): Promise<PullOutcome> {
  await deps.store.initialize();
  const status = await deps.store.readStatus();
  const syncedAt = deps.now().toISOString();

  let cursor = status.cursor;
  let applied = 0;
  let changed = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await deps.sync.pull(cursor);
    if (result.changes.length > 0) {
      applied += await deps.store.applySyncChanges(result.changes, syncedAt);
      changed = true;
    }
    cursor = result.nextCursor;
    if (!result.hasMore) {
      break;
    }
  }

  return { applied, cursor, changed, syncedAt };
}
