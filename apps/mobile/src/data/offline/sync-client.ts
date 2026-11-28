import {
  syncSnapshotResponseSchema,
  type SyncSnapshotResponse,
} from "@focus/contracts";
import { authenticatedHttp } from "../auth/auth-instance";
import type { HttpClient } from "../http/client";

// `/sync/snapshot` est l'instantané complet de bootstrap et de
// resynchronisation (doc 01 §11.5) : le client remplace son miroir local.
export const SYNC_SNAPSHOT_PATH = "/sync/snapshot";

export type SyncClient = {
  readonly snapshot: () => Promise<SyncSnapshotResponse>;
};

export function createSyncClient(http: HttpClient): SyncClient {
  return {
    snapshot: () => http.get(SYNC_SNAPSHOT_PATH, syncSnapshotResponseSchema),
  };
}

export const syncClient = createSyncClient(authenticatedHttp);
