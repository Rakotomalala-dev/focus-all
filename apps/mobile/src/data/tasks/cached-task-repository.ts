import { taskListQuerySchema, type Task, type TaskListQuery } from "@focus/contracts";
import { AppError } from "../http/app-error";
import type { OfflineStore } from "../offline/offline-store";
import { selectCachedTasks } from "../offline/local-task-query";
import type { TaskRepository } from "./task-repository";

// Repository « miroir » (RF-61) : chaque lecture réseau réussie met à jour la
// copie locale, et une coupure réseau sert la copie au lieu d'une erreur. Les
// mutations confirmées par le serveur mettent aussi le miroir à jour, sans
// jamais bloquer la réponse.
export function createCachedTaskRepository(
  remote: TaskRepository,
  store: OfflineStore,
  today: () => string = () => new Date().toISOString().slice(0, 10),
): TaskRepository {
  function isNetworkError(error: unknown): boolean {
    return error instanceof AppError && error.isNetworkError;
  }

  return {
    ...remote,

    list: async (query?: TaskListQuery) => {
      const effective = query ?? taskListQuerySchema.parse({});
      try {
        const page = await remote.list(effective);
        await store.saveTasks(page.items);
        return page;
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        // Sans premier instantané, il n'y a rien à afficher hors ligne : mieux
        // vaut l'erreur réseau que laisser croire que le compte est vide.
        const status = await store.readStatus();
        if (status.lastSyncAt === null) throw error;
        return selectCachedTasks(await store.readTasks(), effective, today());
      }
    },

    findById: async (id: string) => {
      try {
        const task = await remote.findById(id);
        await store.saveTasks([task]);
        return task;
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        const cached = await store.findTask(id);
        if (cached === null) throw error;
        return cached;
      }
    },

    create: async (draft) => {
      const task = await remote.create(draft);
      await store.saveTasks([task]);
      return task;
    },

    setStatus: async (task: Task, status) => {
      const updated = await remote.setStatus(task, status);
      await store.saveTasks([updated]);
      return updated;
    },

    update: async (task, patch) => {
      const updated = await remote.update(task, patch);
      await store.saveTasks([updated]);
      return updated;
    },

    remove: async (task) => {
      await remote.remove(task);
      await store.removeTasks([task.id]);
    },

    restore: async (id) => {
      const restored = await remote.restore(id);
      await store.saveTasks([restored]);
      return restored;
    },

    reorder: async (ids) => {
      const tasks = await remote.reorder(ids);
      await store.saveTasks(tasks);
      return tasks;
    },
  };
}
