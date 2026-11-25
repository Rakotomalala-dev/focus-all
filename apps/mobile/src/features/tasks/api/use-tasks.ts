import type { Task, TaskDraftInput, TaskStatus } from "@focus/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { taskRepository } from "../../../data/tasks/task-repository-instance";

// Une mutation n'invalide que la liste des tâches, jamais tout le cache (ADR-007).
const TASK_LIST_KEY = ["tasks", "list"] as const;

export function useTasks() {
  return useQuery({
    queryKey: TASK_LIST_KEY,
    queryFn: () => taskRepository.list(),
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: TaskDraftInput) => taskRepository.create(draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TASK_LIST_KEY });
    },
  });
}

export function useSetTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ task, status }: { readonly task: Task; readonly status: TaskStatus }) =>
      taskRepository.setStatus(task, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TASK_LIST_KEY });
    },
  });
}
