import type { Prisma, Task as TaskRow } from "@prisma/client";
import type { Task } from "@focus/contracts";

// `sortOrder` est un `numeric(30,15)` : la forme exposée est une chaîne
// décimale à échelle fixe, donc comparable et stable entre deux lectures.
export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    sortOrder: row.sortOrder.toFixed(15),
    version: row.version,
    completedAt: row.completedAt?.toISOString() ?? null,
    pinned: row.pinnedAt !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    tagIds: [...row.tagIds],
    ...(row.description === null ? {} : { description: row.description }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
    ...(row.parentId === null ? {} : { parentId: row.parentId }),
    ...(row.dueTime === null ? {} : { dueTime: row.dueTime }),
    ...(row.startDate === null ? {} : { startDate: row.startDate.toISOString().slice(0, 10) }),
    ...(row.recurrenceRule === null ? {} : { recurrenceRule: row.recurrenceRule }),
    ...(row.estimateMinutes === null ? {} : { estimateMinutes: row.estimateMinutes }),
    reminders: [...row.reminders],
    reminderOffsets: [...row.reminderOffsets],
    recurrenceMode: row.recurrenceMode,
    // `dueDate` est une date civile : la colonne est un `date`, jamais un
    // instant, donc on ne la convertit pas dans le fuseau du serveur.
    ...(row.dueDate === null ? {} : { dueDate: row.dueDate.toISOString().slice(0, 10) }),
  };
}

// Payload du journal : l'état complet et public de l'entité, sans champ interne
// (`workspaceId`, `deletedAt`). `null` explicite remplace les clés absentes,
// parce qu'un payload JSON n'a pas de propriété optionnelle.
export function toTaskPayload(task: Task): Prisma.InputJsonObject {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    projectId: task.projectId ?? null,
    dueDate: task.dueDate ?? null,
    priority: task.priority,
    status: task.status,
    tagIds: [...task.tagIds],
    parentId: task.parentId ?? null,
    dueTime: task.dueTime ?? null,
    startDate: task.startDate ?? null,
    reminders: [...task.reminders],
    reminderOffsets: [...task.reminderOffsets],
    recurrenceRule: task.recurrenceRule ?? null,
    recurrenceMode: task.recurrenceMode,
    estimateMinutes: task.estimateMinutes ?? null,
    sortOrder: task.sortOrder,
    completedAt: task.completedAt,
    pinned: task.pinned,
    version: task.version,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
