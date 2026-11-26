import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./task";

// Palette fermée de 12 teintes : chaque couleur est un token stable, jamais un
// code hexadécimal fourni par le client (doc 02, RF-10).
export const PROJECT_COLORS = [
  "slate",
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "violet",
  "pink",
  "brown",
] as const;

export const projectColorSchema = z.enum(PROJECT_COLORS);
export type ProjectColor = z.infer<typeof projectColorSchema>;

export const MAX_PROJECT_NAME_LENGTH = 80;
export const MAX_PROJECT_DESCRIPTION_LENGTH = 2_000;

export const projectNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_PROJECT_NAME_LENGTH);

export const projectDraftSchema = z.object({
  name: projectNameSchema,
  color: projectColorSchema.optional(),
  description: z.string().max(MAX_PROJECT_DESCRIPTION_LENGTH).optional(),
});

export type ProjectDraftInput = z.input<typeof projectDraftSchema>;
export type ProjectDraft = z.output<typeof projectDraftSchema>;

// `color` et `description` acceptent `null` : c'est la seule façon de les
// effacer, un champ omis signifiant « inchangé ».
export const projectUpdateSchema = z.object({
  name: projectNameSchema.optional(),
  color: projectColorSchema.nullable().optional(),
  description: z.string().max(MAX_PROJECT_DESCRIPTION_LENGTH).nullable().optional(),
  archived: z.boolean().optional(),
  version: z.number().int().nonnegative().optional(),
});

export type ProjectUpdate = z.output<typeof projectUpdateSchema>;

export const projectSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(MAX_PROJECT_NAME_LENGTH),
  color: projectColorSchema.nullable(),
  description: z.string().max(MAX_PROJECT_DESCRIPTION_LENGTH).nullable(),
  sortOrder: z.string().min(1),
  archivedAt: isoDateTimeSchema.nullable(),
  version: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type Project = z.output<typeof projectSchema>;

export const projectListResponseSchema = z.object({
  items: z.array(projectSchema),
});

export type ProjectListResponse = z.output<typeof projectListResponseSchema>;
