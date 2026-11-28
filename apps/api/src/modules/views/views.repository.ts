import type { Project, Task } from "@focus/contracts";

// Une ligne de vue : la tâche est déjà mappée en contrat, le nom du projet et
// la clé d'ordre de carte restent internes au serveur.
export type ViewTaskRow = {
  readonly task: Task;
  readonly projectName: string | null;
  readonly boardOrder: string | null;
};

export type SubtaskSummary = {
  readonly total: number;
  readonly done: number;
};

// Port du module : le service des vues ne connaît pas Prisma (N-1/N-2).
export interface ViewsRepository {
  // Tâches de premier niveau utiles à une fenêtre de dates : échéances de la
  // fenêtre, retards actifs, épinglées, tâches en cours, accomplies dans la
  // fenêtre et séries récurrentes démarrées avant elle.
  tasksForWindow(
    workspaceId: string,
    from: string,
    to: string,
  ): Promise<readonly ViewTaskRow[]>;
  kanbanTasks(workspaceId: string, projectId: string): Promise<readonly ViewTaskRow[]>;
  subtasks(
    workspaceId: string,
    parentIds: readonly string[],
  ): Promise<ReadonlyMap<string, SubtaskSummary>>;
  findProject(workspaceId: string, projectId: string): Promise<Project | undefined>;
}

export const VIEWS_REPOSITORY = "VIEWS_REPOSITORY";
