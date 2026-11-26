import type { Task } from "@focus/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../../i18n";
import { TaskDetailScreen } from "./TaskDetailScreen";

const mocks = vi.hoisted(() => ({
  useTasks: vi.fn(),
  updateMutateAsync: vi.fn(),
  updateResult: { isPending: false, isError: false, error: null as unknown },
  back: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ back: mocks.back }),
}));

vi.mock("../api/use-tasks", () => ({
  useTasks: () => mocks.useTasks(),
  useUpdateTask: () => ({
    ...mocks.updateResult,
    mutateAsync: mocks.updateMutateAsync,
  }),
  useCreateTask: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useSetTaskStatus: () => ({ mutate: vi.fn(), isPending: false }),
}));

const TASK: Task = {
  id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e5f",
  title: "Appeler le comptable",
  description: "Préparer les justificatifs",
  priority: "HIGH",
  tagIds: [],
  status: "TODO",
  completedAt: null,
  sortOrder: "a0",
  version: 3,
  createdAt: "2026-11-25T09:00:00Z",
  updatedAt: "2026-11-25T09:00:00Z",
};

describe("TaskDetailScreen", () => {
  beforeEach(() => {
    mocks.useTasks.mockReset();
    mocks.updateMutateAsync.mockReset();
    mocks.back.mockReset();
    mocks.updateResult.isError = false;
    mocks.updateResult.error = null;
  });

  it("affiche l'état de chargement", () => {
    mocks.useTasks.mockReturnValue({ status: "pending" });

    render(<TaskDetailScreen taskId={TASK.id} />);

    expect(screen.getByText("Chargement des tâches…")).toBeTruthy();
  });

  it("préremplit les champs de la tâche", () => {
    mocks.useTasks.mockReturnValue({
      status: "success",
      data: { items: [TASK], nextCursor: null },
    });

    render(<TaskDetailScreen taskId={TASK.id} />);

    expect(screen.getByDisplayValue("Appeler le comptable")).toBeTruthy();
    expect(screen.getByDisplayValue("Préparer les justificatifs")).toBeTruthy();
  });

  it("enregistre le titre et la priorité avec la version courante", async () => {
    mocks.updateMutateAsync.mockResolvedValue({ ...TASK, version: 4 });
    mocks.useTasks.mockReturnValue({
      status: "success",
      data: { items: [TASK], nextCursor: null },
    });

    render(<TaskDetailScreen taskId={TASK.id} />);

    fireEvent.changeText(screen.getByLabelText("Titre"), "Appeler le comptable demain");
    fireEvent.press(screen.getByLabelText("Priorité urgente"));
    fireEvent.press(screen.getByLabelText("Enregistrer"));

    await waitFor(() => {
      expect(mocks.updateMutateAsync).toHaveBeenCalledWith({
        task: TASK,
        patch: {
          title: "Appeler le comptable demain",
          description: "Préparer les justificatifs",
          priority: "URGENT",
        },
      });
    });
    expect(mocks.back).toHaveBeenCalledTimes(1);
  });

  it("refuse une échéance mal formée sans appeler le serveur", async () => {
    mocks.useTasks.mockReturnValue({
      status: "success",
      data: { items: [TASK], nextCursor: null },
    });

    render(<TaskDetailScreen taskId={TASK.id} />);

    fireEvent.changeText(screen.getByLabelText("Échéance"), "demain");
    fireEvent.press(screen.getByLabelText("Enregistrer"));

    await waitFor(() => {
      expect(screen.getByText("Utilisez le format AAAA-MM-JJ.")).toBeTruthy();
    });
    expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
  });

  it("affiche l'absence de tâche", () => {
    mocks.useTasks.mockReturnValue({
      status: "success",
      data: { items: [], nextCursor: null },
    });

    render(<TaskDetailScreen taskId={TASK.id} />);

    expect(screen.getByText("Tâche introuvable")).toBeTruthy();
  });
});
