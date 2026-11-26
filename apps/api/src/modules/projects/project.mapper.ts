import type { Prisma, Project as ProjectRow } from "@prisma/client";
import { projectColorSchema, type Project } from "@focus/contracts";

// `sortOrder` est un `numeric(30,15)`, comme pour les tâches : la forme exposée
// est une chaîne décimale stable, jamais un flottant.
export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    // La colonne est un texte libre : une valeur héritée hors palette est
    // exposée comme absente plutôt que de faire échouer la lecture complète.
    color: row.color === null ? null : (projectColorSchema.safeParse(row.color).data ?? null),
    description: row.description,
    sortOrder: row.sortOrder.toFixed(15),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toProjectPayload(project: Project): Prisma.InputJsonObject {
  return {
    id: project.id,
    name: project.name,
    color: project.color,
    description: project.description,
    sortOrder: project.sortOrder,
    archivedAt: project.archivedAt,
    version: project.version,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}
