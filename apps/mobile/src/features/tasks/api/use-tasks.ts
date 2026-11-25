import type { Task, TaskDraftInput, TaskStatus } from "@focus/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTaskRepository } from "../../../data/tasks/task-repository-context";

// Clés hiérarchiques : une mutation n'invalide que la liste des tâches, jamais
// l'ensemble du cache (ADR-007).
export const taskKeys = {
  all: ["tasks"] as const,
  list: () => [...taskKeys.all, "list"] as const,
};

export function useTasks() {
  const repository = useTaskRepository();
  return useQuery({
    queryKey: taskKeys.list(),
    queryFn: () => repository.list(),
  });
}

export function useCreateTask() {
  const repository = useTaskRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: TaskDraftInput) => repository.create(draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: taskKeys.list() });
    },
  });
}

export type SetTaskStatusVariables = {
  readonly task: Task;
  readonly status: TaskStatus;
};

export function useSetTaskStatus() {
  const repository = useTaskRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ task, status }: SetTaskStatusVariables) => repository.setStatus(task, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: taskKeys.list() });
    },
  });
}
