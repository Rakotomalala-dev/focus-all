import { z } from "zod";
import { projectSchema } from "./project";
import { PROJECT_COLORS } from "./project";
import { taskSchema, uuidSchema } from "./task";

// RF-26 : tags libres par workspace, nom unique insensible à la casse et
// couleur issue de la même palette accessible que les projets.
export const MAX_TAG_NAME_LENGTH = 40;
export const MAX_TAGS_PER_WORKSPACE = 100;

export const tagColorSchema = z.enum(PROJECT_COLORS);
export const tagNameSchema = z.string().trim().min(1).max(MAX_TAG_NAME_LENGTH);

export const tagDraftSchema = z.object({
  name: tagNameSchema,
  color: tagColorSchema.optional(),
});

export type TagDraftInput = z.input<typeof tagDraftSchema>;
export type TagDraft = z.output<typeof tagDraftSchema>;

export const tagUpdateSchema = z.object({
  name: tagNameSchema.optional(),
  color: tagColorSchema.nullable().optional(),
});

export type TagUpdate = z.output<typeof tagUpdateSchema>;

export const tagSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(MAX_TAG_NAME_LENGTH),
  color: tagColorSchema.nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type Tag = z.output<typeof tagSchema>;

export const tagListResponseSchema = z.object({
  items: z.array(tagSchema),
  nextCursor: z.string().min(1).nullable(),
});

export type TagListResponse = z.output<typeof tagListResponseSchema>;

// Création idempotente utilisée par la saisie rapide `#tag`.
export const tagEnsureSchema = z.object({
  names: z.array(tagNameSchema).min(1).max(20),
});

export type TagEnsure = z.output<typeof tagEnsureSchema>;

export const trashResponseSchema = z.object({
  tasks: z.array(taskSchema),
  projects: z.array(projectSchema),
});

export type TrashResponse = z.output<typeof trashResponseSchema>;
