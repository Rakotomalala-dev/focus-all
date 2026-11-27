import type {
  Task,
  TaskDraftInput,
  TaskListQuery,
  TaskStatus,
} from "@focus/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { taskRepository } from "../../../data/tasks/task-repository-instance";
import type { TaskPatchInput } from "../../../data/tasks/task-repository";

// Une mutation n'invalide que les listes de tâches, jamais tout le cache (ADR-007).
const TASK_LIST_KEY = ["tasks", "list"] as const;

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ task, patch }: { readonly task: Task; readonly patch: TaskPatchInput }) =>
      taskRepository.update(task, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useSetTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ task, status }: { readonly task: Task; readonly status: TaskStatus }) =>
      taskRepository.setStatus(task, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (task: Task) => taskRepository.remove(task),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
