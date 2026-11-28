import type { Project, Tag } from "@focus/contracts";
import type { OfflineCacheStatus, OfflineStore } from "./offline-store";
import type { SyncClient } from "./sync-client";

// Cas d'usage hors ligne : synchroniser l'instantané complet, réinitialiser la
// copie locale (RF-64) et exposer son état pour les réglages.
export type OfflineSyncResult = {
  readonly taskCount: number;
  readonly projectCount: number;
  readonly tagCount: number;
  readonly syncedAt: string;
};

export type OfflineSyncOutcome =
  | { readonly ok: true; readonly result: OfflineSyncResult }
  | { readonly ok: false; readonly error: unknown };

export type OfflineServiceDeps = {
  readonly store: OfflineStore;
  readonly sync: SyncClient;
  // Seules les lectures réseau sont nécessaires : un instantané ne doit pas
  // passer par les repositories « miroir » et se re-cacher lui-même.
  readonly projects: { readonly list: () => Promise<readonly Project[]> };
  readonly tags: { readonly list: () => Promise<readonly Tag[]> };
  readonly now: () => Date;
};

export type OfflineService = {
  readonly synchronize: () => Promise<OfflineSyncOutcome>;
  /**
   * RF-64 : vide la copie locale puis force un instantané complet. Les
   * mutations en attente (outbox RF-62) ne sont pas touchées ; en leur absence
   * en M1, seule la copie en lecture est perdue puis rechargée.
   */
  readonly resetLocalData: () => Promise<OfflineSyncOutcome>;
  readonly readStatus: () => Promise<OfflineCacheStatus>;
};

export function createOfflineService(deps: OfflineServiceDeps): OfflineService {
  async function synchronize(): Promise<OfflineSyncOutcome> {
    try {
      await deps.store.initialize();
      // L'instantané du journal et les listes de référence sont demandés en
      // parallèle : un échec laisse la copie précédente intacte.
      const [snapshot, projects, tags] = await Promise.all([
        deps.sync.snapshot(),
        deps.projects.list(),
        deps.tags.list(),
      ]);
      const syncedAt = deps.now().toISOString();
      await deps.store.saveSnapshot({
        tasks: snapshot.tasks,
        projects,
        tags,
        cursor: snapshot.cursor,
        syncedAt,
      });

      return {
        ok: true,
        result: {
          taskCount: snapshot.tasks.length,
          projectCount: projects.length,
          tagCount: tags.length,
          syncedAt,
        },
      };
    } catch (error) {
      return { ok: false, error };
    }
  }

  return {
    synchronize,

    resetLocalData: async () => {
      await deps.store.initialize();
      await deps.store.reset();
      return synchronize();
    },

    readStatus: async () => {
      await deps.store.initialize();
      return deps.store.readStatus();
    },
  };
}
