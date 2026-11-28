import type { Project, Task, ViewCard } from "@focus/contracts";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../data/http/app-error";
import "../../../i18n";
import { KanbanScreen } from "./KanbanScreen";

const mocks = vi.hoisted(() => ({
  useProjects: vi.fn(),
  useKanban: vi.fn(),
  refetchProjects: vi.fn(),
  refetchKanban: vi.fn(),
  move: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../../projects/api/use-projects", () => ({
  useProjects: () => mocks.useProjects(),
}));

vi.mock("../api/use-views", () => ({
  useKanban: () => mocks.useKanban(),
  useMoveCard: () => ({ mutate: mocks.move, isPending: false, isError: false }),
}));

const PROJECT: Project = {
  id: "018f3b3c-1a2b-7c3d-8e4f-111111111111",
  name: "Lancement",
  color: null,
  description: null,
  sortOrder: "1",
  archivedAt: null,
  version: 0,
  createdAt: "2026-11-25T09:00:00Z",
  updatedAt: "2026-11-25T09:00:00Z",
};

const BASE_TASK: Task = {
  id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e5f",
  title: "Préparer la maquette",
  priority: "HIGH",
  tagIds: [],
  reminders: [],
  reminderOffsets: [],
  recurrenceMode: "FIXED",
  status: "TODO",
  completedAt: null,
  pinned: false,
  sortOrder: "a0",
  version: 3,
  createdAt: "2026-11-25T09:00:00Z",
  updatedAt: "2026-11-25T09:00:00Z",
};

function card(overrides: Partial<Task> = {}): ViewCard {
  return {
    task: { ...BASE_TASK, ...overrides },
    projectName: PROJECT.name,
    subtaskCount: 2,
    subtaskDoneCount: 1,
    occurrenceDate: overrides.dueDate ?? null,
  };
}

const KANBAN_VIEW = {
  projectId: PROJECT.id,
  projectName: PROJECT.name,
  columns: [
    { status: "TODO" as const, tasks: [card()], count: 1 },
    { status: "IN_PROGRESS" as const, tasks: [], count: 0 },
    { status: "DONE" as const, tasks: [], count: 0 },
  ],
};

function projectsSuccess(data: readonly Project[]) {
  return { status: "success", data, refetch: mocks.refetchProjects };
}

describe("KanbanScreen", () => {
  beforeEach(() => {
    mocks.useProjects.mockReset();
    mocks.useKanban.mockReset();
    mocks.move.mockReset();
  });

  it("affiche l'état de chargement des projets", () => {
    mocks.useProjects.mockReturnValue({ status: "pending" });
    mocks.useKanban.mockReturnValue({ status: "pending" });

    render(<KanbanScreen />);

    expect(screen.getByText("Chargement du tableau…")).toBeTruthy();
  });

  it("affiche l'état d'erreur et relance la requête", () => {
    mocks.useProjects.mockReturnValue({
      status: "error",
      error: new AppError({ code: "INTERNAL", status: 500 }),
      refetch: mocks.refetchProjects,
    });
    mocks.useKanban.mockReturnValue({ status: "pending" });

    render(<KanbanScreen />);

    expect(screen.getByText("Impossible de charger le tableau")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Réessayer"));
    expect(mocks.refetchProjects).toHaveBeenCalledTimes(1);
  });

  it("affiche l'état vide sans projet", () => {
    mocks.useProjects.mockReturnValue(projectsSuccess([]));
    mocks.useKanban.mockReturnValue({ status: "pending" });

    render(<KanbanScreen />);

    expect(screen.getByText("Aucun projet")).toBeTruthy();
  });

  it("affiche les trois colonnes et déplace une carte vers le statut suivant", () => {
    mocks.useProjects.mockReturnValue(projectsSuccess([PROJECT]));
    mocks.useKanban.mockReturnValue({ status: "success", data: KANBAN_VIEW });

    render(<KanbanScreen />);

    expect(screen.getByText("À faire")).toBeTruthy();
    expect(screen.getByText("Préparer la maquette")).toBeTruthy();
    expect(screen.getByText(/1\/2 sous-tâches/)).toBeTruthy();
    expect(screen.getAllByText("Lancement").length).toBeGreaterThan(0);

    fireEvent.press(
      screen.getByLabelText("Déplacer « Préparer la maquette » vers En cours"),
    );

    expect(mocks.move).toHaveBeenCalledWith({
      projectId: PROJECT.id,
      taskId: BASE_TASK.id,
      status: "IN_PROGRESS",
      version: 3,
    });
  });
});
