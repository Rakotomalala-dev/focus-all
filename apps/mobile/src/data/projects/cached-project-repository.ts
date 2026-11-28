import { AppError } from "../http/app-error";
import type { OfflineStore } from "../offline/offline-store";
import type { ProjectRepository } from "./project-repository";

// Les projets sont peu nombreux : la liste complète est mise en cache à chaque
// lecture réussie et sert telle quelle hors ligne (RF-61).
export function createCachedProjectRepository(
  remote: ProjectRepository,
  store: OfflineStore,
): ProjectRepository {
  return {
    ...remote,
    list: async () => {
      try {
        const projects = await remote.list();
        await store.saveProjects(projects);
        return projects;
      } catch (error) {
        if (!(error instanceof AppError) || !error.isNetworkError) throw error;
        return store.readProjects();
      }
    },
  };
}
