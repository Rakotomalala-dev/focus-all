import type { Task } from "@focus/contracts";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../data/http/app-error";
import "../../../i18n";
import { TasksScreen } from "./TasksScreen";

const mocks = vi.hoisted(() => ({
  useTasks: vi.fn(),
  refetch: vi.fn(),
  createMutateAsync: vi.fn(),
  setMutation: vi.fn(),
}));

// Les hooks TanStack Query sont le seul point d'entrée serveur de l'écran :
// les mocker garde le test de composant pur, sans réseau ni cache.
vi.mock("../api/use-tasks", () => ({
  useTasks: () => mocks.useTasks(),
  useCreateTask: () => ({
    mutateAsync: mocks.createMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
  useSetTaskStatus: () => ({
    mutate: mocks.setMutation,
    isPending: false,
  }),
}));

const TASK: Task = {
  id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e5f",
  title: "Appeler le comptable",
  priority: "HIGH",
  tagIds: [],
  status: "TODO",
  completedAt: null,
  sortOrder: "a0",
  version: 1,
  createdAt: "2026-11-25T09:00:00Z",
  updatedAt: "2026-11-25T09:00:00Z",
};

describe("TasksScreen", () => {
  beforeEach(() => {
    mocks.useTasks.mockReset();
    mocks.refetch.mockReset();
    mocks.createMutateAsync.mockReset();
    mocks.setMutation.mockReset();
  });

  it("affiche l'état de chargement", () => {
    mocks.useTasks.mockReturnValue({ status: "pending" });

    render(<TasksScreen />);

    expect(screen.getByText("Chargement des tâches…")).toBeTruthy();
    expect(screen.queryByText("Aucune tâche pour l'instant")).toBeNull();
  });

  it("affiche l'erreur traduite depuis le code et relance la requête", () => {
    mocks.useTasks.mockReturnValue({
      status: "error",
      error: new AppError({ code: "UNAUTHENTICATED", status: 401 }),
      refetch: mocks.refetch,
    });

    render(<TasksScreen />);

    expect(screen.getByText("Impossible de charger les tâches")).toBeTruthy();
    expect(
      screen.getByText("Votre session a expiré. Reconnectez-vous pour continuer."),
    ).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Réessayer"));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("affiche l'état vide quand la page ne contient aucune tâche", () => {
    mocks.useTasks.mockReturnValue({
      status: "success",
      data: { items: [], nextCursor: null },
    });

    render(<TasksScreen />);

    expect(screen.getByText("Aucune tâche pour l'instant")).toBeTruthy();
    expect(screen.getByText("0 tâche")).toBeTruthy();
  });

  it("rend la liste et bascule une tâche vers DONE", () => {
    mocks.useTasks.mockReturnValue({
      status: "success",
      data: { items: [TASK], nextCursor: null },
    });

    render(<TasksScreen />);

    expect(screen.getByText("Appeler le comptable")).toBeTruthy();
    expect(screen.getByText("1 tâche")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Marquer « Appeler le comptable » comme terminée"));

    expect(mocks.setMutation).toHaveBeenCalledWith({ task: TASK, status: "DONE" });
  });
});
