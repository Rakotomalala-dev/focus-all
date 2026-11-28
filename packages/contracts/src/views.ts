import { z } from "zod";
import { isoDateSchema, taskSchema, uuidSchema } from "./task";

// Vues agrégées M1 (RF-31 à RF-34). Le serveur calcule une seule réponse : le
// client n'enchaîne jamais une liste de tâches par jour, ce qui rend les
// compteurs de charge et les sections cohérents entre eux.

export const UPCOMING_DAYS = 7;
// Seuils de surcharge d'une journée (RF-32) : charge estimée ou volume.
export const DAY_OVERLOAD_MINUTES = 8 * 60;
export const DAY_OVERLOAD_TASKS = 12;

export const CALENDAR_MODES = ["MONTH", "WEEK"] as const;
export const calendarModeSchema = z.enum(CALENDAR_MODES);
export type CalendarMode = z.infer<typeof calendarModeSchema>;

// Une carte de vue enrichit la tâche de ce que la liste ne porte pas : nom du
// projet, avancement des sous-tâches et date de l'occurrence affichée.
// `occurrenceDate` diffère de `task.dueDate` pour une occurrence récurrente
// future, calculée à la volée et jamais persistée (RF-33).
export const viewCardSchema = z.object({
  task: taskSchema,
  projectName: z.string().min(1).nullable(),
  subtaskCount: z.number().int().nonnegative(),
  subtaskDoneCount: z.number().int().nonnegative(),
  // `null` quand la carte n'a pas d'échéance (tâche épinglée, colonne Kanban).
  occurrenceDate: isoDateSchema.nullable(),
});

export type ViewCard = z.output<typeof viewCardSchema>;

export const TODAY_SECTIONS = [
  "OVERDUE",
  "TODAY",
  "IN_PROGRESS",
  "PINNED",
  "COMPLETED",
] as const;
export const todaySectionKeySchema = z.enum(TODAY_SECTIONS);
export type TodaySectionKey = z.infer<typeof todaySectionKeySchema>;

export const todaySectionSchema = z.object({
  key: todaySectionKeySchema,
  tasks: z.array(viewCardSchema),
  count: z.number().int().nonnegative(),
  estimateMinutes: z.number().int().nonnegative(),
  // « Accomplies » est la seule section repliée au premier rendu (RF-31).
  collapsedByDefault: z.boolean(),
});

export type TodaySection = z.output<typeof todaySectionSchema>;

export const todayViewSchema = z.object({
  date: isoDateSchema,
  sections: z.array(todaySectionSchema),
  // Somme des estimations des cartes actives affichées (hors accomplies).
  loadMinutes: z.number().int().nonnegative(),
  loadTaskCount: z.number().int().nonnegative(),
});

export type TodayView = z.output<typeof todayViewSchema>;

export const todayQuerySchema = z.object({
  // Date de référence : utile aux tests et aux clients qui rejouent une
  // journée. Omise, le serveur prend le jour courant (UTC).
  date: isoDateSchema.optional(),
});

export const upcomingDaySchema = z.object({
  date: isoDateSchema,
  tasks: z.array(viewCardSchema),
  count: z.number().int().nonnegative(),
  estimateMinutes: z.number().int().nonnegative(),
  overloaded: z.boolean(),
});

export type UpcomingDay = z.output<typeof upcomingDaySchema>;

export const upcomingViewSchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  days: z.array(upcomingDaySchema),
});

export type UpcomingView = z.output<typeof upcomingViewSchema>;

export const upcomingQuerySchema = z.object({
  date: isoDateSchema.optional(),
});

export const calendarDaySchema = z.object({
  date: isoDateSchema,
  tasks: z.array(viewCardSchema),
  count: z.number().int().nonnegative(),
  estimateMinutes: z.number().int().nonnegative(),
});

export type CalendarDay = z.output<typeof calendarDaySchema>;

export const calendarViewSchema = z.object({
  mode: calendarModeSchema,
  anchor: isoDateSchema,
  from: isoDateSchema,
  to: isoDateSchema,
  days: z.array(calendarDaySchema),
});

export type CalendarView = z.output<typeof calendarViewSchema>;

export const calendarQuerySchema = z.object({
  mode: calendarModeSchema.default("MONTH"),
  // N'importe quelle date du mois ou de la semaine à afficher.
  anchor: isoDateSchema.optional(),
});

export const KANBAN_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;
export const kanbanStatusSchema = z.enum(KANBAN_STATUSES);
export type KanbanStatus = z.infer<typeof kanbanStatusSchema>;

export const kanbanColumnSchema = z.object({
  status: kanbanStatusSchema,
  tasks: z.array(viewCardSchema),
  count: z.number().int().nonnegative(),
});

export type KanbanColumn = z.output<typeof kanbanColumnSchema>;

export const kanbanViewSchema = z.object({
  projectId: uuidSchema,
  projectName: z.string().min(1),
  columns: z.array(kanbanColumnSchema),
});

export type KanbanView = z.output<typeof kanbanViewSchema>;

export const kanbanQuerySchema = z.object({
  projectId: uuidSchema,
});

// Déplacement d'une carte (RF-34) : statut + position. `afterId` est la carte
// qui restera au-dessus, `beforeId` celle qui restera en dessous ; les deux à
// `null` placent la carte en fin de colonne. `version` active le contrôle
// optimiste déjà utilisé par `PATCH /tasks/:id`.
export const kanbanMoveSchema = z.object({
  projectId: uuidSchema,
  taskId: uuidSchema,
  status: kanbanStatusSchema,
  version: z.number().int().nonnegative(),
  afterId: uuidSchema.nullable().optional(),
  beforeId: uuidSchema.nullable().optional(),
});

export type KanbanMove = z.output<typeof kanbanMoveSchema>;
