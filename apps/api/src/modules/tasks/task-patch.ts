import type { TaskUpdate } from "@focus/contracts";
import type { TaskPatch } from "./task.repository";

// `exactOptionalPropertyTypes` : une clé absente est omise, jamais mise à
// `undefined`. Le même mapping sert au PATCH REST et au push de sync, pour que
// les deux chemins ne puissent pas écrire des champs différents.
export function toTaskPatch(fields: Omit<TaskUpdate, "version">): TaskPatch {
  return {
    ...(fields.title === undefined ? {} : { title: fields.title }),
    ...(fields.description === undefined ? {} : { description: fields.description }),
    ...(fields.projectId === undefined ? {} : { projectId: fields.projectId }),
    ...(fields.dueDate === undefined ? {} : { dueDate: fields.dueDate }),
    ...(fields.priority === undefined ? {} : { priority: fields.priority }),
    ...(fields.tagIds === undefined ? {} : { tagIds: fields.tagIds }),
    ...(fields.status === undefined ? {} : { status: fields.status }),
  };
}
