import { AppError } from "../http/app-error";
import type { OfflineStore } from "../offline/offline-store";
import type { TagRepository } from "./tag-repository";

// Les tags sont partagés par le workspace et nécessaires à la lecture hors
// ligne des tâches filtrées : la liste est mirrorée à chaque lecture réussie.
export function createCachedTagRepository(
  remote: TagRepository,
  store: OfflineStore,
): TagRepository {
  return {
    ...remote,
    list: async () => {
      try {
        const tags = await remote.list();
        await store.saveTags(tags);
        return tags;
      } catch (error) {
        if (!(error instanceof AppError) || !error.isNetworkError) throw error;
        return store.readTags();
      }
    },
  };
}
