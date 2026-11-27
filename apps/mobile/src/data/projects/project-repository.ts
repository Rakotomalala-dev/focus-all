import {
  projectDraftSchema,
  projectListResponseSchema,
  projectSchema,
  projectUpdateSchema,
  type Project,
  type ProjectDraftInput,
  type ProjectUpdate,
} from "@focus/contracts";
import type { HttpClient } from "../http/client";

export const PROJECTS_PATH = "/projects";

export type ProjectPatchInput = Omit<ProjectUpdate, "version">;

export type ProjectRepository = {
  readonly list: () => Promise<readonly Project[]>;
  readonly create: (draft: ProjectDraftInput) => Promise<Project>;
  readonly update: (project: Project, patch: ProjectPatchInput) => Promise<Project>;
  readonly remove: (project: Project) => Promise<void>;
  readonly reorder: (ids: readonly string[]) => Promise<readonly Project[]>;
  readonly restore: (id: string) => Promise<Project>;
};

// 204 sans corps : le schéma vide évite un second chemin non validé.
const NO_CONTENT = { parse: (): void => undefined };

export function createProjectRepository(http: HttpClient): ProjectRepository {
  return {
    list: async () => {
      const response = await http.get(PROJECTS_PATH, projectListResponseSchema);
      return response.items;
    },

    create: async (draft) =>
      http.post(PROJECTS_PATH, projectDraftSchema.parse(draft), projectSchema),

    update: async (project, patch) => {
      // La version courante est celle de la liste : le serveur répond 409 si
      // elle est obsolète, sans dépendre d'un ETag mémorisé.
      const payload = projectUpdateSchema.parse({ ...patch, version: project.version });
      return http.patch(`${PROJECTS_PATH}/${project.id}`, payload, projectSchema);
    },

    remove: (project) =>
      http.delete(`${PROJECTS_PATH}/${project.id}`, NO_CONTENT, { version: project.version }),

    reorder: (ids) =>
      http.patch(`${PROJECTS_PATH}/order`, { ids }, {
        parse: (value: unknown) => {
          if (!Array.isArray(value)) {
            throw new Error("Réponse de réordonnancement invalide");
          }
          return value.map((item) => projectSchema.parse(item));
        },
      }),

    restore: (id) => http.post(`${PROJECTS_PATH}/${id}/restore`, undefined, projectSchema),
  };
}
