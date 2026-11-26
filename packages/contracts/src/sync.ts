import { z } from "zod";
import { isoDateTimeSchema, taskSchema, uuidSchema } from "./task";

// Protocole de synchronisation (doc 01 §11, doc 03 §6.3).
// Le serveur est la seule autorité sur `version` et sur le curseur : le client
// ne fournit que son intention (`baseVersion`) et un identifiant idempotent.
export const SYNC_MAX_MUTATIONS = 100;
export const SYNC_MAX_PULL_CHANGES = 500;

export const SYNC_ENTITY_TYPES = ["task"] as const;
export const syncEntityTypeSchema = z.enum(SYNC_ENTITY_TYPES);
export type SyncEntityType = z.infer<typeof syncEntityTypeSchema>;

export const SYNC_MUTATION_OPERATIONS = ["CREATE", "UPDATE", "DELETE"] as const;
export const syncMutationOperationSchema = z.enum(SYNC_MUTATION_OPERATIONS);
export type SyncMutationOperation = z.infer<typeof syncMutationOperationSchema>;

export const SYNC_JOURNAL_OPERATIONS = ["UPSERT", "DELETE"] as const;
export const syncJournalOperationSchema = z.enum(SYNC_JOURNAL_OPERATIONS);
export type SyncJournalOperation = z.infer<typeof syncJournalOperationSchema>;

// `payload` reste `unknown` ici : sa forme dépend de l'opération (création,
// mise à jour partielle, suppression). Le service la valide avec le schéma de
// la ressource avant toute écriture.
export const syncMutationSchema = z.object({
  clientMutationId: uuidSchema,
  entityType: syncEntityTypeSchema,
  entityId: uuidSchema,
  operation: syncMutationOperationSchema,
  baseVersion: z.number().int().nonnegative().optional(),
  payload: z.unknown().optional(),
});

export type SyncMutation = z.output<typeof syncMutationSchema>;

export const syncPushRequestSchema = z.object({
  deviceId: uuidSchema.optional(),
  mutations: z.array(syncMutationSchema).min(1).max(SYNC_MAX_MUTATIONS),
});

export type SyncPushRequest = z.output<typeof syncPushRequestSchema>;

export const SYNC_RESULT_STATUSES = ["applied", "conflict", "rejected"] as const;
export const syncResultStatusSchema = z.enum(SYNC_RESULT_STATUSES);
export type SyncResultStatus = z.infer<typeof syncResultStatusSchema>;

export const syncPushResultSchema = z.object({
  clientMutationId: uuidSchema,
  status: syncResultStatusSchema,
  entityId: uuidSchema,
  // Version serveur après application (absente si la mutation est rejetée
  // avant lecture de l'entité).
  version: z.number().int().nonnegative().optional(),
  // État serveur courant : renseigné sur `applied` et `conflict`, pour que le
  // client remplace sa ligne sans requête supplémentaire.
  server: taskSchema.nullable().optional(),
  // `code` est un code public stable (UNAUTHENTICATED, NOT_FOUND, …) et
  // `reason` la clé i18n : jamais une phrase (AGENTS §2).
  code: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
});

export type SyncPushResult = z.output<typeof syncPushResultSchema>;

export const syncPushResponseSchema = z.object({
  results: z.array(syncPushResultSchema),
  // Position du journal après le lot : le client peut la réutiliser pour son
  // prochain pull.
  cursor: z.number().int().nonnegative(),
});

export type SyncPushResponse = z.output<typeof syncPushResponseSchema>;

export const syncPullQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(SYNC_MAX_PULL_CHANGES).default(SYNC_MAX_PULL_CHANGES),
});

export type SyncPullQuery = z.output<typeof syncPullQuerySchema>;

export const syncChangeSchema = z.object({
  cursor: z.number().int().nonnegative(),
  entityType: syncEntityTypeSchema,
  entityId: uuidSchema,
  operation: syncJournalOperationSchema,
  version: z.number().int().nonnegative(),
  payload: z.unknown(),
  actorId: uuidSchema.nullable(),
  changedAt: isoDateTimeSchema,
});

export type SyncChange = z.output<typeof syncChangeSchema>;

export const syncPullResponseSchema = z.object({
  changes: z.array(syncChangeSchema),
  nextCursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export type SyncPullResponse = z.output<typeof syncPullResponseSchema>;

export const syncSnapshotResponseSchema = z.object({
  tasks: z.array(taskSchema),
  cursor: z.number().int().nonnegative(),
});

export type SyncSnapshotResponse = z.output<typeof syncSnapshotResponseSchema>;
