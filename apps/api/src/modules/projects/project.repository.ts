import type { Project, ProjectDraft } from "@focus/contracts";

export type ProjectPatch = {
  readonly name?: string;
  readonly color?: string | null;
  readonly description?: string | null;
  readonly archivedAt?: Date | null;
};

export type ProjectMutationResult =
  | { readonly status: "ok"; readonly project: Project }
  | { readonly status: "not_found" }
  | { readonly status: "conflict"; readonly currentVersion: number }
  | { readonly status: "name_taken" };

export type ProjectCreateResult =
  | { readonly status: "ok"; readonly project: Project }
  | { readonly status: "name_taken" };

// Port du module : le service ne dépend pas de Prisma (N-1/N-2).
export interface ProjectRepository {
  create(
    draft: ProjectDraft,
    workspaceId: string,
    actorId: string | undefined,
  ): Promise<ProjectCreateResult>;
  list(workspaceId: string): Promise<readonly Project[]>;
  findById(id: string, workspaceId: string): Promise<Project | undefined>;
  update(
    id: string,
    workspaceId: string,
    patch: ProjectPatch,
    expectedVersion: number,
    actorId: string | undefined,
  ): Promise<ProjectMutationResult>;
  remove(
    id: string,
    workspaceId: string,
    expectedVersion: number,
    actorId: string | undefined,
  ): Promise<ProjectMutationResult>;
}

export const PROJECT_REPOSITORY = "PROJECT_REPOSITORY";
