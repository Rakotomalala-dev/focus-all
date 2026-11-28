import type { KanbanMove, Task, TaskStatus } from "@focus/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { taskRepository } from "../../../data/tasks/task-repository-instance";
import type { CalendarQuery } from "../../../data/views/views-repository";
import { viewsRepository } from "../../../data/views/views-repository-instance";

const VIEWS_KEY = ["views"] as const;

export function useToday() {
  return useQuery({
    queryKey: [...VIEWS_KEY, "today"],
    queryFn: () => viewsRepository.today(),
  });
}

export function useUpcoming() {
  return useQuery({
    queryKey: [...VIEWS_KEY, "upcoming"],
    queryFn: () => viewsRepository.upcoming(),
  });
}

export function useCalendar(query: CalendarQuery) {
  return useQuery({
    queryKey: [...VIEWS_KEY, "calendar", query.mode, query.anchor],
    queryFn: () => viewsRepository.calendar(query),
  });
}

export function useKanban(projectId: string | null) {
  return useQuery({
    queryKey: [...VIEWS_KEY, "kanban", projectId],
    queryFn: () => viewsRepository.kanban(projectId ?? ""),
    enabled: projectId !== null,
  });
}

// Toute mutation d'une vue invalide les vues et les listes de tâches : les
// compteurs de charge et la liste principale restent cohérents entre écrans.
function invalidateViews(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: [VIEWS_KEY] }),
    queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  ]);
}

export function useMoveCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: KanbanMove) => viewsRepository.moveCard(input),
    onSuccess: async () => {
      await invalidateViews(queryClient);
    },
  });
}

export function useSetViewTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ task, status }: { readonly task: Task; readonly status: TaskStatus }) =>
      taskRepository.setStatus(task, status),
    onSuccess: async () => {
      await invalidateViews(queryClient);
    },
  });
}

// RF-31 : l'épingle est une propriété de la tâche, mais son effet est une vue.
export function useTogglePin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (task: Task) => taskRepository.update(task, { pinned: !task.pinned }),
    onSuccess: async () => {
      await invalidateViews(queryClient);
    },
  });
}
