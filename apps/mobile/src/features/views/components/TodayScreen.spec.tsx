import type { Task, ViewCard } from "@focus/contracts";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../data/http/app-error";
import "../../../i18n";
import { TodayScreen } from "./TodayScreen";

const mocks = vi.hoisted(() => ({
  useToday: vi.fn(),
  refetch: vi.fn(),
  setStatus: vi.fn(),
  togglePin: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../api/use-views", () => ({
  useToday: () => mocks.useToday(),
  useSetViewTaskStatus: () => ({ mutate: mocks.setStatus, isPending: false }),
  useTogglePin: () => ({ mutate: mocks.togglePin, isPending: false, isError: false }),
}));

const BASE_TASK: Task = {
  id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e5f",
  title: "Appeler le comptable",
  priority: "HIGH",
  tagIds: [],
  reminders: [],
  reminderOffsets: [],
  recurrenceMode: "FIXED",
  status: "TODO",
  completedAt: null,
  pinned: false,
  sortOrder: "a0",
  version: 1,
  createdAt: "2026-11-25T09:00:00Z",
  updatedAt: "2026-11-25T09:00:00Z",
};

function card(overrides: Partial<Task> = {}, extra: Partial<ViewCard> = {}): ViewCard {
  return {
    task: { ...BASE_TASK, ...overrides },
    projectName: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    occurrenceDate: overrides.dueDate ?? null,
    ...extra,
  };
}

const TODAY_VIEW = {
  date: "2026-11-27",
  loadMinutes: 90,
  loadTaskCount: 2,
  sections: [
    {
      key: "OVERDUE" as const,
      tasks: [card({ title: "Facture en retard", dueDate: "2026-11-25", estimateMinutes: 30 })],
      count: 1,
      estimateMinutes: 30,
      collapsedByDefault: false,
    },
    {
      key: "COMPLETED" as const,
      tasks: [card({ title: "Terminée", status: "DONE", completedAt: "2026-11-27T10:00:00Z" })],
      count: 1,
      estimateMinutes: 0,
      collapsedByDefault: true,
    },
  ],
};

describe("TodayScreen", () => {
  beforeEach(() => {
    mocks.useToday.mockReset();
    mocks.refetch.mockReset();
    mocks.setStatus.mockReset();
    mocks.togglePin.mockReset();
  });

  it("affiche l'état de chargement", () => {
    mocks.useToday.mockReturnValue({ status: "pending" });

    render(<TodayScreen />);

    expect(screen.getByText("Chargement de votre journée…")).toBeTruthy();
  });

  it("affiche l'erreur traduite et relance la requête", () => {
    mocks.useToday.mockReturnValue({
      status: "error",
      error: new AppError({ code: "UNAUTHENTICATED", status: 401 }),
      refetch: mocks.refetch,
    });

    render(<TodayScreen />);

    expect(screen.getByText("Impossible de charger Aujourd'hui")).toBeTruthy();
    expect(
      screen.getByText("Votre session a expiré. Reconnectez-vous pour continuer."),
    ).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Réessayer"));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("affiche l'état vide quand aucune section n'est active", () => {
    mocks.useToday.mockReturnValue({
      status: "success",
      data: { date: "2026-11-27", sections: [], loadMinutes: 0, loadTaskCount: 0 },
    });

    render(<TodayScreen />);

    expect(screen.getByText("Rien pour aujourd'hui")).toBeTruthy();
  });

  it("replie la section Accomplies par défaut et l'ouvre au toucher", () => {
    mocks.useToday.mockReturnValue({ status: "success", data: TODAY_VIEW });

    render(<TodayScreen />);

    expect(screen.getByText("En retard")).toBeTruthy();
    expect(screen.getByText("Charge : 1 h 30 · 2 tâches")).toBeTruthy();
    expect(screen.queryByText("Terminée")).toBeNull();

    fireEvent.press(screen.getByLabelText("Déplier la section « Accomplies »"));

    expect(screen.getByText("Terminée")).toBeTruthy();
  });

  it("épingle une tâche sans échéance", () => {
    mocks.useToday.mockReturnValue({
      status: "success",
      data: {
        date: "2026-11-27",
        loadMinutes: 0,
        loadTaskCount: 1,
        sections: [
          {
            key: "PINNED",
            tasks: [card({ title: "Idée du jour", pinned: false })],
            count: 1,
            estimateMinutes: 0,
            collapsedByDefault: false,
          },
        ],
      },
    });

    render(<TodayScreen />);

    fireEvent.press(screen.getByLabelText("Épingler « Idée du jour »"));

    expect(mocks.togglePin).toHaveBeenCalledWith(
      expect.objectContaining({ id: BASE_TASK.id, title: "Idée du jour" }),
    );
  });
});
