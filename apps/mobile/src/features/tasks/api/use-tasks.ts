import type {
  Task,
  TaskDraftInput,
  TaskListQuery,
  TaskStatus,
} from "@focus/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotificationStore } from "../../../data/notifications/notification-store";
import { reminderSync } from "../../../data/notifications/reminder-sync-instance";
import { taskRepository } from "../../../data/tasks/task-repository-instance";
import type { TaskPatchInput } from "../../../data/tasks/task-repository";

// Une mutation n'invalide que les listes de tâches, jamais tout le cache (ADR-007).
const TASK_LIST_KEY = ["tasks", "list"] as const;

// RF-50 : la notification locale suit l'état confirmé par le serveur. Un échec
// de planification est publié dans le store (affiché dans les réglages) sans
// transformer une mutation réussie en erreur.
async function syncLocalReminders(task: Task): Promise<void> {
  try {
    await reminderSync.syncTask(task);
    useNotificationStore.getState().setSchedulingFailed(false);
  } catch {
    useNotificationStore.getState().setSchedulingFailed(true);
  }
}

async function cancelLocalReminders(taskId: string): Promise<void> {
  try {
    await reminderSync.cancelTask(taskId);
    useNotificationStore.getState().setSchedulingFailed(false);
  } catch {
    useNotificationStore.getState().setSchedulingFailed(true);
  }
}

export function useTasks(query: TaskListQuery = { limit: 100, sort: "MANUAL" }) {
  return useQuery({
    queryKey: [...TASK_LIST_KEY, query],
    queryFn: () => taskRepository.list(query),
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ["tasks", "detail", id],
    queryFn: () => taskRepository.findById(id),
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: TaskDraftInput) => taskRepository.create(draft),
    onSuccess: async (task) => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await syncLocalReminders(task);
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ task, patch }: { readonly task: Task; readonly patch: TaskPatchInput }) =>
      taskRepository.update(task, patch),
    onSuccess: async (task) => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await syncLocalReminders(task);
    },
  });
}

export function useSetTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ task, status }: { readonly task: Task; readonly status: TaskStatus }) =>
      taskRepository.setStatus(task, status),
    onSuccess: async (task) => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await syncLocalReminders(task);
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (task: Task) => taskRepository.remove(task),
    onSuccess: async (_result, task) => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await cancelLocalReminders(task.id);
    },
  });
}

export function useReorderTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: readonly string[]) => taskRepository.reorder(ids),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useEmptyInbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => taskRepository.emptyInbox(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useTrash() {
  return useQuery({
    queryKey: ["tasks", "trash"],
    queryFn: () => taskRepository.trash(),
  });
}

export function useRestoreTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => taskRepository.restore(id),
    onSuccess: async (task) => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await syncLocalReminders(task);
    },
  });
}
