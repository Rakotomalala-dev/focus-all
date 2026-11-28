import {
  SYNC_MAX_PULL_CHANGES,
  syncPullResponseSchema,
  syncSnapshotResponseSchema,
  type SyncPullResponse,
  type SyncSnapshotResponse,
} from "@focus/contracts";
import { authenticatedHttp } from "../auth/auth-instance";
import type { HttpClient } from "../http/client";

// `/sync/snapshot` est l'instantané complet de bootstrap et de
// resynchronisation (doc 01 §11.5) : le client remplace son miroir local.
export const SYNC_SNAPSHOT_PATH = "/sync/snapshot";

export type SyncClient = {
  readonly snapshot: () => Promise<SyncSnapshotResponse>;
  readonly pull: (since: number, limit?: number) => Promise<SyncPullResponse>;
};

export function createSyncClient(http: HttpClient): SyncClient {
  return {
    snapshot: () => http.get(SYNC_SNAPSHOT_PATH, syncSnapshotResponseSchema),
    pull: (since, limit = SYNC_MAX_PULL_CHANGES) =>
      http.get(`/sync/pull?since=${since}&limit=${limit}`, syncPullResponseSchema),
  };
}

export const syncClient = createSyncClient(authenticatedHttp);
