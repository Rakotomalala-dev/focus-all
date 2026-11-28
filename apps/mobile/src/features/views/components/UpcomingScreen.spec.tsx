import type { Task, ViewCard } from "@focus/contracts";
import { render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../data/http/app-error";
import "../../../i18n";
import { UpcomingScreen } from "./UpcomingScreen";

const mocks = vi.hoisted(() => ({
  useUpcoming: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../api/use-views", () => ({
  useUpcoming: () => mocks.useUpcoming(),
  useSetViewTaskStatus: () => ({ mutate: vi.fn(), isPending: false }),
}));

const BASE_TASK: Task = {
  id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e5f",
  title: "Préparer la réunion",
  priority: "MEDIUM",
  tagIds: [],
  reminders: [],
  recurrenceMode: "FIXED",
  status: "TODO",
  completedAt: null,
  pinned: false,
  sortOrder: "a0",
  version: 1,
  createdAt: "2026-11-25T09:00:00Z",
  updatedAt: "2026-11-25T09:00:00Z",
};

function card(overrides: Partial<Task> = {}): ViewCard {
  return {
    task: { ...BASE_TASK, ...overrides },
    projectName: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    occurrenceDate: overrides.dueDate ?? null,
  };
}

const DAYS = Array.from({ length: 7 }, (_, index) => ({
  date: new Date(Date.parse("2026-11-27T00:00:00.000Z") + index * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10),
  tasks: [],
  count: 0,
  estimateMinutes: 0,
  overloaded: false,
}));

const UPCOMING_VIEW = {
  from: "2026-11-27",
  to: "2026-12-03",
  days: [
    {
      ...DAYS[0],
      tasks: [card({ title: "Préparer la réunion", dueDate: "2026-11-27", dueTime: "14:00" })],
      count: 1,
      estimateMinutes: 500,
      overloaded: true,
    },
    ...DAYS.slice(1),
  ],
};

describe("UpcomingScreen", () => {
  beforeEach(() => {
    mocks.useUpcoming.mockReset();
    mocks.refetch.mockReset();
  });

  it("affiche l'état de chargement", () => {
    mocks.useUpcoming.mockReturnValue({ status: "pending" });

    render(<UpcomingScreen />);

    expect(screen.getByText("Chargement des sept prochains jours…")).toBeTruthy();
  });

  it("affiche l'état d'erreur et relance la requête", () => {
    mocks.useUpcoming.mockReturnValue({
      status: "error",
      error: new AppError({ code: "NOT_FOUND", status: 404 }),
      refetch: mocks.refetch,
    });

    render(<UpcomingScreen />);

    expect(screen.getByText("Impossible de charger Prochain")).toBeTruthy();
    expect(screen.getByLabelText("Réessayer")).toBeTruthy();
  });

  it("affiche l'état vide quand les sept jours sont libres", () => {
    mocks.useUpcoming.mockReturnValue({
      status: "success",
      data: { from: "2026-11-27", to: "2026-12-03", days: DAYS },
    });

    render(<UpcomingScreen />);

    expect(screen.getByText("Semaine dégagée")).toBeTruthy();
  });

  it("affiche les jours, la charge et le signal de surcharge", () => {
    mocks.useUpcoming.mockReturnValue({ status: "success", data: UPCOMING_VIEW });

    render(<UpcomingScreen />);

    expect(screen.getByText("Préparer la réunion")).toBeTruthy();
    expect(screen.getByText("Journée chargée")).toBeTruthy();
    expect(screen.getByText("1 tâche · 8 h 20")).toBeTruthy();
    expect(screen.getAllByText("Rien de prévu.")).toHaveLength(6);
  });
});
