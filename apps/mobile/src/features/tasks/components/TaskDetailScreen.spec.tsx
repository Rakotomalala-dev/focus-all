import type { Task } from "@focus/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../data/http/app-error";
import "../../../i18n";
import { TaskDetailScreen } from "./TaskDetailScreen";

const mocks = vi.hoisted(() => ({
  useTask: vi.fn(),
  updateMutate: vi.fn(),
  updateResult: { isPending: false, isError: false, error: null as unknown },
  deleteMutate: vi.fn(),
  createMutateAsync: vi.fn(),
  setStatusMutate: vi.fn(),
  back: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ back: mocks.back }),
}));

vi.mock("../../projects/api/use-projects", () => ({
  useProjects: () => ({ status: "success", data: [] }),
}));

vi.mock("../../tags/api/use-tags", () => ({
  useTags: () => ({ status: "success", data: [] }),
  useEnsureTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../api/use-tasks", () => ({
  useTask: () => mocks.useTask(),
  useTasks: () => ({ status: "success", data: { items: [], nextCursor: null } }),
  useUpdateTask: () => ({
    ...mocks.updateResult,
    mutate: mocks.updateMutate,
  }),
  useDeleteTask: () => ({ mutate: mocks.deleteMutate, isPending: false, isError: false, error: null }),
  useCreateTask: () => ({
    mutateAsync: mocks.createMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
  useSetTaskStatus: () => ({ mutate: mocks.setStatusMutate, isPending: false }),
}));

const TASK: Task = {
  id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e5f",
  title: "Appeler le comptable",
  description: "Préparer les justificatifs",
  priority: "HIGH",
  tagIds: [],
  reminders: [],
  recurrenceMode: "FIXED",
  status: "TODO",
  completedAt: null,
  sortOrder: "a0",
  version: 3,
  createdAt: "2026-11-25T09:00:00Z",
  updatedAt: "2026-11-25T09:00:00Z",
};

describe("TaskDetailScreen", () => {
  beforeEach(() => {
    mocks.useTask.mockReset();
    mocks.updateMutate.mockReset();
    mocks.back.mockReset();
    mocks.updateResult.isError = false;
    mocks.updateResult.error = null;
    mocks.updateMutate.mockImplementation((_variables, options?: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });
  });

  it("affiche l'état de chargement", () => {
    mocks.useTask.mockReturnValue({ status: "pending" });

    render(<TaskDetailScreen taskId={TASK.id} />);

    expect(screen.getByText("Chargement des tâches…")).toBeTruthy();
  });

  it("préremplit les champs de la tâche", () => {
    mocks.useTask.mockReturnValue({ status: "success", data: TASK });

    render(<TaskDetailScreen taskId={TASK.id} />);

    expect(screen.getByDisplayValue("Appeler le comptable")).toBeTruthy();
    expect(screen.getByDisplayValue("Préparer les justificatifs")).toBeTruthy();
  });

  it("enregistre le titre et la priorité avec la version courante", async () => {
    mocks.useTask.mockReturnValue({ status: "success", data: TASK });

    render(<TaskDetailScreen taskId={TASK.id} />);

    fireEvent.changeText(screen.getByLabelText("Titre"), "Appeler le comptable demain");
    fireEvent.press(screen.getByLabelText("Priorité urgente"));
    fireEvent.press(screen.getByLabelText("Enregistrer"));

    await waitFor(() => {
      expect(mocks.updateMutate).toHaveBeenCalledWith(
        {
          task: TASK,
          patch: {
            title: "Appeler le comptable demain",
            description: "Préparer les justificatifs",
            status: "TODO",
            priority: "URGENT",
            projectId: null,
            dueDate: null,
            dueTime: null,
            startDate: null,
            estimateMinutes: null,
            tagIds: [],
            reminders: [],
            recurrenceRule: null,
            recurrenceMode: "FIXED",
          },
        },
        expect.anything(),
      );
    });
    expect(mocks.back).toHaveBeenCalledTimes(1);
  });

  it("refuse une échéance mal formée sans appeler le serveur", async () => {
    mocks.useTask.mockReturnValue({ status: "success", data: TASK });

    render(<TaskDetailScreen taskId={TASK.id} />);

    fireEvent.changeText(screen.getByLabelText("Échéance"), "demain");
    fireEvent.press(screen.getByLabelText("Enregistrer"));

    await waitFor(() => {
      expect(screen.getByText("Utilisez le format AAAA-MM-JJ.")).toBeTruthy();
    });
    expect(mocks.updateMutate).not.toHaveBeenCalled();
  });

  it("affiche l'erreur de chargement", () => {
    mocks.useTask.mockReturnValue({
      status: "error",
      error: new AppError({ code: "NOT_FOUND", status: 404 }),
      refetch: vi.fn(),
    });

    render(<TaskDetailScreen taskId={TASK.id} />);

    expect(screen.getByText("Impossible de charger les tâches")).toBeTruthy();
  });
});
