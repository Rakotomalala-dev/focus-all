import { z } from "zod";

// Statuts et priorités viennent du cahier des charges (doc 02, RF tâches).
// TS-3 : `as const` + `z.enum`, jamais d'`enum` TypeScript.
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const TASK_PRIORITIES = ["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const RECURRENCE_MODES = ["FIXED", "AFTER_COMPLETION"] as const;
export const recurrenceModeSchema = z.enum(RECURRENCE_MODES);
export type RecurrenceMode = z.infer<typeof recurrenceModeSchema>;

export const TASK_SORTS = ["MANUAL", "DUE_DATE", "PRIORITY", "CREATED_AT", "TITLE"] as const;
export const taskSortSchema = z.enum(TASK_SORTS);
export type TaskSort = z.infer<typeof taskSortSchema>;

export const DUE_FILTERS = ["OVERDUE", "TODAY", "NEXT_7_DAYS", "NONE"] as const;
export const dueFilterSchema = z.enum(DUE_FILTERS);
export type DueFilter = z.infer<typeof dueFilterSchema>;

export const MAX_TASK_TITLE_LENGTH = 500;
export const MAX_TASK_DESCRIPTION_LENGTH = 10_000;
export const MAX_TASK_TAGS = 20;
export const MAX_TASK_REMINDERS = 10;
export const MAX_SUBTASKS = 50;
export const MAX_RECURRENCE_LENGTH = 400;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export const uuidSchema = z.string().uuid();
export const isoDateTimeSchema = z.string().datetime({ offset: true });
// Date civile (échéance) : pas d'heure, pas de fuseau — le fuseau de
// l'utilisateur est stocké à part (ADR-017).
export const isoDateSchema = z.string().date();
export const hhmmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");
export const taskTitleSchema = z.string().trim().min(1).max(MAX_TASK_TITLE_LENGTH);

const optionalDescription = z.string().max(MAX_TASK_DESCRIPTION_LENGTH).optional();

// Entrée de création/édition : les champs optionnels sont ceux que le client
// peut omettre, les valeurs par défaut sont appliquées par le serveur.
export const taskDraftSchema = z.object({
  title: taskTitleSchema,
  description: optionalDescription,
  projectId: uuidSchema.optional(),
  parentId: uuidSchema.optional(),
  dueDate: isoDateSchema.optional(),
  dueTime: hhmmSchema.optional(),
  startDate: isoDateSchema.optional(),
  priority: taskPrioritySchema.default("NONE"),
  tagIds: z.array(uuidSchema).max(MAX_TASK_TAGS).default([]),
  reminders: z.array(isoDateTimeSchema).max(MAX_TASK_REMINDERS).default([]),
  recurrenceRule: z.string().trim().min(1).max(MAX_RECURRENCE_LENGTH).optional(),
  recurrenceMode: recurrenceModeSchema.default("FIXED"),
  estimateMinutes: z.number().int().min(1).max(24 * 60).optional(),
});

export type TaskDraftInput = z.input<typeof taskDraftSchema>;
export type TaskDraft = z.output<typeof taskDraftSchema>;

// Entité telle que renvoyée par l'API : `version` sert au contrôle optimiste
// (If-Match / 409 CONFLICT_VERSION), `sortOrder` au réordonnancement manuel.
// Le workspace d'appartenance reste interne au serveur (N-3/N-7) : il n'est
// ni utile au client ni exposable, donc il n'apparaît pas dans le contrat.
export const taskSchema = taskDraftSchema.extend({
  id: uuidSchema,
  status: taskStatusSchema,
  completedAt: isoDateTimeSchema.nullable(),
  sortOrder: z.string().min(1),
  version: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type Task = z.output<typeof taskSchema>;

// Pagination par curseur (N-9) : jamais d'`offset`.
export const pageQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PageQuery = z.output<typeof pageQuerySchema>;

const csvUuids = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part.length > 0)
      : value,
  z.array(uuidSchema).max(MAX_TASK_TAGS).optional(),
);

const booleanQuery = z.preprocess(
  (value) => (value === "true" ? true : value === "false" ? false : value),
  z.boolean().optional(),
);

export const taskListQuerySchema = pageQuerySchema.extend({
  sort: taskSortSchema.default("MANUAL"),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  projectId: uuidSchema.optional(),
  inbox: booleanQuery,
  parentId: uuidSchema.optional(),
  tagIds: csvUuids,
  due: dueFilterSchema.optional(),
  q: z.string().trim().min(1).max(200).optional(),
  includeCompleted: booleanQuery,
});

export type TaskListQuery = z.output<typeof taskListQuerySchema>;

// Mise à jour partielle (PATCH) : tous les champs sont optionnels, y compris
// `version` qui peut venir de l'en-tête `If-Match` à la place du corps.
export const taskUpdateSchema = z.object({
  title: taskTitleSchema.optional(),
  description: z.string().max(MAX_TASK_DESCRIPTION_LENGTH).nullable().optional(),
  // `null` replace la tâche dans l'Inbox ; omis, le projet ne change pas.
  projectId: uuidSchema.nullable().optional(),
  parentId: uuidSchema.nullable().optional(),
  dueDate: isoDateSchema.nullable().optional(),
  dueTime: hhmmSchema.nullable().optional(),
  startDate: isoDateSchema.nullable().optional(),
  priority: taskPrioritySchema.optional(),
  tagIds: z.array(uuidSchema).max(MAX_TASK_TAGS).optional(),
  reminders: z.array(isoDateTimeSchema).max(MAX_TASK_REMINDERS).optional(),
  recurrenceRule: z.string().trim().min(1).max(MAX_RECURRENCE_LENGTH).nullable().optional(),
  recurrenceMode: recurrenceModeSchema.optional(),
  estimateMinutes: z.number().int().min(1).max(24 * 60).nullable().optional(),
  status: taskStatusSchema.optional(),
  // Version attendue par le client : contrôle optimiste (409 CONFLICT_VERSION).
  version: z.number().int().nonnegative().optional(),
});

export type TaskUpdate = z.output<typeof taskUpdateSchema>;

// Suppression : la version attendue peut venir de `?version=` ou d'`If-Match`.
export const versionQuerySchema = z.object({
  version: z.coerce.number().int().nonnegative().optional(),
});

export type VersionQuery = z.output<typeof versionQuerySchema>;

export const taskOrderSchema = z.object({
  ids: z.array(uuidSchema).min(1).max(500),
});

export type TaskOrder = z.output<typeof taskOrderSchema>;

export const projectOrderSchema = z.object({
  ids: z.array(uuidSchema).min(1).max(500),
});

export type ProjectOrder = z.output<typeof projectOrderSchema>;

export const inboxEmptySchema = z.object({
  projectId: uuidSchema,
});

export type InboxEmpty = z.output<typeof inboxEmptySchema>;

// Enveloppe de liste : `nextCursor` vaut `null` en fin de parcours, jamais `""`.
export const taskListResponseSchema = z.object({
  items: z.array(taskSchema),
  nextCursor: z.string().min(1).nullable(),
  total: z.number().int().nonnegative().optional(),
});

export type TaskListResponse = z.output<typeof taskListResponseSchema>;
