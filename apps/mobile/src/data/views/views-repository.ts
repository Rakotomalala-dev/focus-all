import {
  calendarViewSchema,
  kanbanViewSchema,
  kanbanMoveSchema,
  taskSchema,
  todayViewSchema,
  upcomingViewSchema,
  type CalendarMode,
  type CalendarView,
  type KanbanMove,
  type KanbanView,
  type Task,
  type TodayView,
  type UpcomingView,
} from "@focus/contracts";
import type { HttpClient } from "../http/client";

// Les vues sont des agrégats serveur : un seul aller-retour par écran, jamais
// une liste de tâches recomposée côté client (RF-31 à RF-34).
export const VIEWS_PATH = "/views";

export type CalendarQuery = {
  readonly mode: CalendarMode;
  readonly anchor: string;
};

export type ViewsRepository = {
  readonly today: () => Promise<TodayView>;
  readonly upcoming: () => Promise<UpcomingView>;
  readonly calendar: (query: CalendarQuery) => Promise<CalendarView>;
  readonly kanban: (projectId: string) => Promise<KanbanView>;
  readonly moveCard: (input: KanbanMove) => Promise<Task>;
};

export function createViewsRepository(http: HttpClient): ViewsRepository {
  return {
    today: () => http.get(`${VIEWS_PATH}/today`, todayViewSchema),
    upcoming: () => http.get(`${VIEWS_PATH}/upcoming`, upcomingViewSchema),
    calendar: (query) =>
      http.get(`${VIEWS_PATH}/calendar`, calendarViewSchema, {
        mode: query.mode,
        anchor: query.anchor,
      }),
    kanban: (projectId) =>
      http.get(`${VIEWS_PATH}/kanban`, kanbanViewSchema, { projectId }),
    moveCard: async (input) => {
      const payload = kanbanMoveSchema.parse(input);
      return http.post(`${VIEWS_PATH}/kanban/move`, payload, taskSchema);
    },
  };
}
