import type { Tag as TagRow } from "@prisma/client";
import { tagColorSchema, type Tag } from "@focus/contracts";

export function toTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color === null ? null : (tagColorSchema.safeParse(row.color).data ?? null),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function normalizeTagName(name: string): string {
  return name.trim().toLocaleLowerCase("fr");
}
