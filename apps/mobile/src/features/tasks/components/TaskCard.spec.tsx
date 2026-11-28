import type { Task } from "@focus/contracts";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, vi } from "vitest";
import "../../../i18n";
import { TaskCard } from "./TaskCard";

const TASK: Task = {
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

describe("TaskCard", () => {
  it("rend le titre, le statut, la priorité et une case accessible non cochée", () => {
    render(<TaskCard task={TASK} onToggle={vi.fn()} isPending={false} />);

    expect(screen.getByText("Appeler le comptable")).toBeTruthy();
    expect(screen.getByText("À faire · Priorité haute")).toBeTruthy();

    const checkbox = screen.getByLabelText("Marquer « Appeler le comptable » comme terminée");
    expect(checkbox.props.accessibilityRole).toBe("checkbox");
    expect(checkbox.props.accessibilityState).toEqual({ checked: false, disabled: false });
  });

  it("déclenche le basculement au clic sur la case", () => {
    const onToggle = vi.fn();
    render(<TaskCard task={TASK} onToggle={onToggle} isPending={false} />);

    fireEvent.press(screen.getByLabelText("Marquer « Appeler le comptable » comme terminée"));

    expect(onToggle).toHaveBeenCalledWith(TASK);
  });

  it("annonce une tâche terminée comme cochée et propose de la rouvrir", () => {
    render(
      <TaskCard
        task={{ ...TASK, status: "DONE", completedAt: "2026-11-25T10:00:00Z" }}
        onToggle={vi.fn()}
        isPending={false}
      />,
    );

    const checkbox = screen.getByLabelText("Rouvrir « Appeler le comptable »");
    expect(checkbox.props.accessibilityState).toEqual({ checked: true, disabled: false });
  });

  it("désactive la case pendant une mutation en cours", () => {
    render(<TaskCard task={TASK} onToggle={vi.fn()} isPending />);

    const checkbox = screen.getByLabelText("Marquer « Appeler le comptable » comme terminée");
    expect(checkbox.props.accessibilityState).toEqual({ checked: false, disabled: true });
  });
});
