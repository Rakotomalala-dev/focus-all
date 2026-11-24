import { z } from "zod";

// Statuts et priorités viennent du cahier des charges (doc 02, RF tâches).
// TS-3 : `as const` + `z.enum`, jamais d'`enum` TypeScript.
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const TASK_PRIORITIES = ["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const MAX_TASK_TITLE_LENGTH = 200;
export const MAX_TASK_DESCRIPTION_LENGTH = 10_000;
export const MAX_TASK_TAGS = 20;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export const uuidSchema = z.string().uuid();
export const isoDateTimeSchema = z.string().datetime({ offset: true });
// Date civile (échéance) : pas d'heure, pas de fuseau — le fuseau de
// l'utilisateur est stocké à part (ADR-017).
export const isoDateSchema = z.string().date();
export const taskTitleSchema = z.string().trim().min(1).max(MAX_TASK_TITLE_LENGTH);

// Entrée de création/édition : les champs optionnels sont ceux que le client
// peut omettre, les valeurs par défaut sont appliquées par le serveur.
export const taskDraftSchema = z.object({
  title: taskTitleSchema,
  description: z.string().max(MAX_TASK_DESCRIPTION_LENGTH).optional(),
  projectId: uuidSchema.optional(),
  dueDate: isoDateSchema.optional(),
  priority: taskPrioritySchema.default("NONE"),
  tagIds: z.array(uuidSchema).max(MAX_TASK_TAGS).default([]),
});

export type TaskDraftInput = z.input<typeof taskDraftSchema>;
export type TaskDraft = z.output<typeof taskDraftSchema>;

// Entité telle que renvoyée par l'API : `version` sert au contrôle optimiste
// (If-Match / 409 CONFLICT_VERSION), `sortOrder` au réordonnancement manuel.
export const taskSchema = taskDraftSchema.extend({
  id: uuidSchema,
  workspaceId: uuidSchema,
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

export const taskListQuerySchema = pageQuerySchema.extend({
  status: taskStatusSchema.optional(),
  projectId: uuidSchema.optional(),
});

export type TaskListQuery = z.output<typeof taskListQuerySchema>;

// Enveloppe de liste : `nextCursor` vaut `null` en fin de parcours, jamais `""`.
export const taskListResponseSchema = z.object({
  items: z.array(taskSchema),
  nextCursor: z.string().min(1).nullable(),
});

export type TaskListResponse = z.output<typeof taskListResponseSchema>;
