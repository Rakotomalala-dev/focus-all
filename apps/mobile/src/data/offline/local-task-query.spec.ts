import { taskListQuerySchema, taskSchema, type Task } from "@focus/contracts";
import { describe, expect, it } from "vitest";
import { selectCachedTasks } from "./local-task-query";

const TODAY = "2026-11-28";

function buildTask(id: string, overrides: Partial<Task> = {}): Task {
  return taskSchema.parse({
    id,
    title: "Tâche",
    status: "TODO",
    completedAt: null,
    pinned: false,
    sortOrder: "a0",
    version: 1,
    createdAt: "2026-11-25T09:00:00Z",
    updatedAt: "2026-11-25T09:00:00Z",
    ...overrides,
  });
}

const OVERDUE = buildTask("018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e01", {
  title: "En retard",
  dueDate: "2026-11-27",
  priority: "HIGH",
  sortOrder: "a0",
});
const TODAY_TASK = buildTask("018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e02", {
  title: "Réunion d'équipe",
  dueDate: TODAY,
  priority: "URGENT",
  sortOrder: "b0",
  tagIds: ["018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e11"],
});
const FUTURE = buildTask("018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e03", {
  title: "Comptabilité",
  dueDate: "2026-12-03",
  priority: "NONE",
  sortOrder: "c0",
  projectId: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e12",
  tagIds: [
    "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e11",
    "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e13",
  ],
});
const NO_DATE = buildTask("018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e04", {
  title: "Lire",
  sortOrder: "d0",
});
const DONE = buildTask("018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e05", {
  title: "Terminée",
  status: "DONE",
  completedAt: "2026-11-27T12:00:00Z",
  dueDate: TODAY,
});

const ALL = [OVERDUE, TODAY_TASK, FUTURE, NO_DATE, DONE];

function idsOf(tasks: readonly Task[]): readonly string[] {
  return tasks.map((task) => task.id);
}

describe("selectCachedTasks", () => {
  it("masque les tâches terminées par défaut et les inclut sur demande", () => {
    const withoutCompleted = selectCachedTasks(
      ALL,
      taskListQuerySchema.parse({ limit: 50 }),
      TODAY,
    );
    expect(idsOf(withoutCompleted.items)).not.toContain(DONE.id);

    const withCompleted = selectCachedTasks(
      ALL,
      taskListQuerySchema.parse({ limit: 50, includeCompleted: true }),
      TODAY,
    );
    expect(idsOf(withCompleted.items)).toContain(DONE.id);
  });

  it("reproduit les filtres d'échéance", () => {
    const overdue = selectCachedTasks(
      ALL,
      taskListQuerySchema.parse({ due: "OVERDUE" }),
      TODAY,
    );
    expect(idsOf(overdue.items)).toEqual([OVERDUE.id]);

    const today = selectCachedTasks(ALL, taskListQuerySchema.parse({ due: "TODAY" }), TODAY);
    expect(idsOf(today.items)).toEqual([TODAY_TASK.id]);

    const next = selectCachedTasks(
      ALL,
      taskListQuerySchema.parse({ due: "NEXT_7_DAYS" }),
      TODAY,
    );
    expect(idsOf(next.items)).toEqual([TODAY_TASK.id, FUTURE.id]);

    const none = selectCachedTasks(ALL, taskListQuerySchema.parse({ due: "NONE" }), TODAY);
    expect(idsOf(none.items)).toEqual([NO_DATE.id]);
  });

  it("combine statut, priorité, projet, inbox et tags", () => {
    expect(
      idsOf(
        selectCachedTasks(
          ALL,
          taskListQuerySchema.parse({ priority: "HIGH" }),
          TODAY,
        ).items,
      ),
    ).toEqual([OVERDUE.id]);

    expect(
      idsOf(
        selectCachedTasks(
          ALL,
          taskListQuerySchema.parse({ projectId: FUTURE.projectId }),
          TODAY,
        ).items,
      ),
    ).toEqual([FUTURE.id]);

    expect(
      idsOf(selectCachedTasks(ALL, taskListQuerySchema.parse({ inbox: true }), TODAY).items),
    ).toEqual([OVERDUE.id, TODAY_TASK.id, NO_DATE.id]);

    expect(
      idsOf(
        selectCachedTasks(
          ALL,
          taskListQuerySchema.parse({
            tagIds: `${TODAY_TASK.tagIds[0] ?? ""},${FUTURE.tagIds[1] ?? ""}`,
          }),
          TODAY,
        ).items,
      ),
    ).toEqual([FUTURE.id]);
  });

  it("cherche sans tenir compte des accents ni de la casse", () => {
    const result = selectCachedTasks(
      ALL,
      taskListQuerySchema.parse({ q: "REUNION" }),
      TODAY,
    );
    expect(idsOf(result.items)).toEqual([TODAY_TASK.id]);
  });

  it("trie par priorité, échéance, création, titre ou ordre manuel", () => {
    expect(
      idsOf(
        selectCachedTasks(
          ALL,
          taskListQuerySchema.parse({ sort: "PRIORITY" }),
          TODAY,
        ).items,
      ),
    ).toEqual([TODAY_TASK.id, OVERDUE.id, FUTURE.id, NO_DATE.id]);

    expect(
      idsOf(
        selectCachedTasks(ALL, taskListQuerySchema.parse({ sort: "DUE_DATE" }), TODAY).items,
      ),
    ).toEqual([OVERDUE.id, TODAY_TASK.id, FUTURE.id, NO_DATE.id]);

    expect(
      idsOf(selectCachedTasks(ALL, taskListQuerySchema.parse({ sort: "TITLE" }), TODAY).items),
    ).toEqual([FUTURE.id, OVERDUE.id, NO_DATE.id, TODAY_TASK.id]);

    expect(
      idsOf(selectCachedTasks(ALL, taskListQuerySchema.parse({ sort: "MANUAL" }), TODAY).items),
    ).toEqual([OVERDUE.id, TODAY_TASK.id, FUTURE.id, NO_DATE.id]);
  });

  it("borne la page et n'annonce pas de curseur hors ligne", () => {
    const result = selectCachedTasks(ALL, taskListQuerySchema.parse({ limit: 2 }), TODAY);
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });
});
