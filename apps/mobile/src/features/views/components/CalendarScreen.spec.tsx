import type { Task, ViewCard } from "@focus/contracts";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../data/http/app-error";
import "../../../i18n";
import { CalendarScreen } from "./CalendarScreen";

const mocks = vi.hoisted(() => ({
  useCalendar: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../api/use-views", () => ({
  useCalendar: () => mocks.useCalendar(),
}));

const BASE_TASK: Task = {
  id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e5f",
  title: "Réviser les maths",
  priority: "HIGH",
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

const NOVEMBER_DAYS = Array.from({ length: 30 }, (_, index) => {
  const date = `2026-11-${(index + 1).toString().padStart(2, "0")}`;
  if (date !== "2026-11-27") {
    return { date, tasks: [], count: 0, estimateMinutes: 0 };
  }
  return {
    date,
    tasks: [card({ title: "Réviser les maths", dueDate: date, dueTime: "14:00" })],
    count: 1,
    estimateMinutes: 45,
  };
});

const MONTH_VIEW = {
  mode: "MONTH" as const,
  anchor: "2026-11-27",
  from: "2026-11-01",
  to: "2026-11-30",
  days: NOVEMBER_DAYS,
};

const EMPTY_MONTH_VIEW = {
  ...MONTH_VIEW,
  days: NOVEMBER_DAYS.map((day) => ({
    date: day.date,
    tasks: [],
    count: 0,
    estimateMinutes: 0,
  })),
};

describe("CalendarScreen", () => {
  beforeEach(() => {
    mocks.useCalendar.mockReset();
    mocks.refetch.mockReset();
  });

  it("affiche l'état de chargement", () => {
    mocks.useCalendar.mockReturnValue({ status: "pending" });

    render(<CalendarScreen />);

    expect(screen.getByText("Chargement du calendrier…")).toBeTruthy();
  });

  it("affiche l'état d'erreur et relance la requête", () => {
    mocks.useCalendar.mockReturnValue({
      status: "error",
      error: new AppError({ code: "INTERNAL", status: 500 }),
      refetch: mocks.refetch,
    });

    render(<CalendarScreen />);

    expect(screen.getByText("Impossible de charger le calendrier")).toBeTruthy();
    expect(screen.getByLabelText("Réessayer")).toBeTruthy();
  });

  it("affiche l'état vide quand la période ne contient aucune tâche", () => {
    mocks.useCalendar.mockReturnValue({ status: "success", data: EMPTY_MONTH_VIEW });

    render(<CalendarScreen />);

    expect(screen.getByText("Aucune tâche sur cette période.")).toBeTruthy();
    expect(screen.getByText("Aucune tâche ce jour-là.")).toBeTruthy();
  });

  it("sélectionne un jour du mois et affiche ses tâches", () => {
    mocks.useCalendar.mockReturnValue({ status: "success", data: MONTH_VIEW });

    render(<CalendarScreen />);

    fireEvent.press(screen.getByLabelText(/27 nov\./));

    expect(screen.getAllByText("Réviser les maths").length).toBeGreaterThan(0);
    expect(screen.getByText("14:00 · Priorité haute")).toBeTruthy();
  });

  it("bascule en semaine et garde les heures des tâches", () => {
    mocks.useCalendar.mockReturnValue({
      status: "success",
      data: { ...MONTH_VIEW, mode: "WEEK", from: "2026-11-23", to: "2026-11-29", days: NOVEMBER_DAYS.slice(22, 29) },
    });

    render(<CalendarScreen />);

    fireEvent.press(screen.getByLabelText("Semaine"));

    expect(screen.getByText("14:00")).toBeTruthy();
  });
});
