import {
  calendarViewSchema,
  kanbanViewSchema,
  problemDetailsSchema,
  syncPullResponseSchema,
  taskListResponseSchema,
  taskSchema,
  todayViewSchema,
  upcomingViewSchema,
  type Task,
} from "@focus/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startTestApi,
  type HttpResult,
  type RequestOptions,
  type TestApi,
} from "../../../test/helpers/test-api";

// Tests d'intégration HTTP des quatre vues M1 : vraie application Nest +
// Fastify + PostgreSQL éphémère. Chaque fichier possède son workspace, donc
// les compteurs ne dépendent pas des autres suites exécutées en parallèle.
let api: TestApi;
let authorization = "";

const DAY_MS = 24 * 60 * 60 * 1000;
const TODAY = new Date().toISOString().slice(0, 10);

function day(offset: number): string {
  return new Date(Date.parse(`${TODAY}T00:00:00.000Z`) + offset * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function sameMonth(left: string, right: string): boolean {
  return left.slice(0, 7) === right.slice(0, 7);
}

function request(
  path: string,
  options?: Omit<RequestOptions, "authorization">,
): Promise<HttpResult> {
  return api.request(path, { ...options, authorization });
}

async function createTask(payload: Record<string, unknown>): Promise<Task> {
  const result = await request("/api/v1/tasks", { method: "POST", body: payload });
  expect(result.status).toBe(201);
  return taskSchema.parse(result.body);
}

async function patchTask(
  id: string,
  version: number,
  body: Record<string, unknown>,
): Promise<Task> {
  const result = await request(`/api/v1/tasks/${id}`, {
    method: "PATCH",
    body: { ...body, version },
  });
  expect(result.status).toBe(200);
  return taskSchema.parse(result.body);
}

async function createProject(name: string): Promise<string> {
  const result = await request("/api/v1/projects", { method: "POST", body: { name } });
  expect(result.status).toBe(201);
  return (result.body as { id: string }).id;
}

beforeAll(async () => {
  api = await startTestApi();
  authorization = await api.bearerToken(await api.createWorkspace("views-http"));
});

afterAll(async () => {
  await api?.close();
});

describe("état vide", () => {
  it("Aujourd'hui renvoie un agrégat vide, sans section fantôme", async () => {
    const result = await request("/api/v1/views/today");

    expect(result.status).toBe(200);
    expect(todayViewSchema.parse(result.body)).toMatchObject({
      date: TODAY,
      sections: [],
      loadMinutes: 0,
      loadTaskCount: 0,
    });
  });

  it("Prochain renvoie sept jours même sans tâche", async () => {
    const result = await request("/api/v1/views/upcoming");

    expect(result.status).toBe(200);
    const view = upcomingViewSchema.parse(result.body);
    expect(view.from).toBe(TODAY);
    expect(view.to).toBe(day(6));
    expect(view.days).toHaveLength(7);
    expect(view.days.every((entry) => entry.count === 0)).toBe(true);
  });
});

describe("Aujourd'hui — sections, ordre et charge", () => {
  it("ordonne En retard, Aujourd'hui, En cours, Épinglées puis Accomplies", async () => {
    const overdue = await createTask({
      title: "En retard",
      dueDate: day(-2),
      priority: "HIGH",
      estimateMinutes: 30,
    });
    const dueToday = await createTask({
      title: "Due aujourd'hui",
      dueDate: TODAY,
      priority: "URGENT",
      estimateMinutes: 60,
    });
    const inProgress = await createTask({
      title: "Déjà commencée",
      dueDate: day(3),
    });
    const pinned = await createTask({ title: "Épinglée sans date" });
    const completed = await createTask({ title: "Terminée aujourd'hui", dueDate: TODAY });

    await patchTask(inProgress.id, inProgress.version, { status: "IN_PROGRESS" });
    const pinnedTask = await patchTask(pinned.id, pinned.version, { pinned: true });
    await patchTask(completed.id, completed.version, { status: "DONE" });

    const result = await request("/api/v1/views/today");
    expect(result.status).toBe(200);
    const view = todayViewSchema.parse(result.body);

    expect(view.sections.map((section) => section.key)).toEqual([
      "OVERDUE",
      "TODAY",
      "IN_PROGRESS",
      "PINNED",
      "COMPLETED",
    ]);

    const overdueSection = view.sections[0];
    expect(overdueSection?.tasks.map((card) => card.task.id)).toEqual([overdue.id]);
    expect(overdueSection?.estimateMinutes).toBe(30);
    expect(overdueSection?.tasks[0]?.projectName).toBeNull();

    expect(view.sections[1]?.tasks.map((card) => card.task.id)).toEqual([dueToday.id]);
    expect(pinnedTask.pinned).toBe(true);
    expect(view.sections[3]?.tasks.map((card) => card.task.id)).toEqual([pinned.id]);

    // « Accomplies » est la seule section repliée au premier rendu (RF-31).
    expect(view.sections[4]?.collapsedByDefault).toBe(true);
    expect(view.sections.slice(0, 4).every((section) => !section.collapsedByDefault)).toBe(true);

    // Charge = estimations des cartes actives, hors accomplies.
    expect(view.loadMinutes).toBe(90);
    expect(view.loadTaskCount).toBe(4);
  });

  it("exclut les tâches annulées et les sous-tâches", async () => {
    const cancelled = await createTask({ title: "Annulée", dueDate: TODAY });
    await patchTask(cancelled.id, cancelled.version, { status: "CANCELLED" });

    const parent = await createTask({ title: "Parent", dueDate: TODAY });
    await createTask({ title: "Sous-tâche", parentId: parent.id });

    const view = todayViewSchema.parse((await request("/api/v1/views/today")).body);
    const ids = view.sections.flatMap((section) => section.tasks.map((card) => card.task.id));

    expect(ids).not.toContain(cancelled.id);
    expect(ids).toContain(parent.id);
    expect(view.sections.find((section) => section.key === "TODAY")?.tasks).toHaveLength(2);
  });
});

describe("Prochain — sept jours et surcharge", () => {
  it("groupe par jour avec compteur et charge, et signale une journée chargée", async () => {
    const heavy = await createTask({
      title: "Grosse journée",
      dueDate: TODAY,
      estimateMinutes: 500,
    });

    const view = upcomingViewSchema.parse((await request("/api/v1/views/upcoming")).body);
    const first = view.days[0];

    expect(first?.date).toBe(TODAY);
    expect(first?.tasks.map((card) => card.task.id)).toContain(heavy.id);
    // 60 + 500 minutes : au-delà du seuil de 8 h.
    expect(first?.estimateMinutes).toBeGreaterThan(480);
    expect(first?.overloaded).toBe(true);
    expect(view.days[1]?.overloaded).toBe(false);

    const third = view.days[3];
    expect(third?.tasks.map((card) => card.task.id).length).toBeGreaterThan(0);
    expect(third?.tasks.every((card) => card.task.dueDate === day(3))).toBe(true);
  });
});

describe("Calendrier — occurrences récurrentes non persistées", () => {
  it("affiche les occurrences futures calculées sans créer de ligne", async () => {
    const recurring = await createTask({
      title: "Rituel hebdomadaire",
      dueDate: TODAY,
      recurrenceRule: "RRULE:FREQ=WEEKLY",
    });

    const before = taskListResponseSchema.parse(
      (await request("/api/v1/tasks?limit=100")).body,
    ).items.filter((task) => task.id === recurring.id);
    expect(before).toHaveLength(1);

    const result = await request(`/api/v1/views/calendar?mode=MONTH&anchor=${TODAY}`);
    expect(result.status).toBe(200);
    const view = calendarViewSchema.parse(result.body);

    expect(view.from <= TODAY && TODAY <= view.to).toBe(true);

    const occurrences = view.days
      .flatMap((entry) => entry.tasks)
      .filter((card) => card.task.id === recurring.id);
    const expected: string[] = [];
    for (let offset = 0; sameMonth(day(offset), TODAY); offset += 7) {
      expected.push(day(offset));
    }

    expect(occurrences.map((card) => card.occurrenceDate).sort()).toEqual(expected.sort());
    // La série persistée garde son échéance d'origine ; seules les dates
    // affichées changent pour les occurrences virtuelles.
    expect(occurrences.every((card) => card.task.dueDate === TODAY)).toBe(true);

    const after = taskListResponseSchema.parse(
      (await request("/api/v1/tasks?limit=100")).body,
    ).items.filter((task) => task.id === recurring.id);
    expect(after).toHaveLength(1);
  });

  it("affiche la semaine du lundi au dimanche", async () => {
    const view = calendarViewSchema.parse(
      (await request(`/api/v1/views/calendar?mode=WEEK&anchor=${TODAY}`)).body,
    );

    expect(view.days).toHaveLength(7);
    expect(new Date(`${view.from}T00:00:00.000Z`).getUTCDay()).toBe(1);
    expect(new Date(`${view.to}T00:00:00.000Z`).getUTCDay()).toBe(0);
  });
});

describe("Kanban — colonnes et déplacement", () => {
  let projectId = "";
  let first: Task;
  let second: Task;
  let third: Task;

  beforeAll(async () => {
    projectId = await createProject("Tableau M1");
    first = await createTask({ title: "Carte A", projectId, dueDate: TODAY, priority: "HIGH" });
    second = await createTask({ title: "Carte B", projectId, dueDate: day(1) });
    third = await createTask({ title: "Carte C", projectId });
  });

  it("renvoie trois colonnes et les cartes du projet", async () => {
    const result = await request(`/api/v1/views/kanban?projectId=${projectId}`);
    expect(result.status).toBe(200);
    const view = kanbanViewSchema.parse(result.body);

    expect(view.projectName).toBe("Tableau M1");
    expect(view.columns.map((column) => column.status)).toEqual([
      "TODO",
      "IN_PROGRESS",
      "DONE",
    ]);
    expect(view.columns[0]?.tasks.map((card) => card.task.id)).toEqual([
      first.id,
      second.id,
      third.id,
    ]);
  });

  it("déplace une carte : statut, position, completedAt et journal de sync", async () => {
    const movedToProgress = await request("/api/v1/views/kanban/move", {
      method: "POST",
      body: {
        projectId,
        taskId: second.id,
        status: "IN_PROGRESS",
        version: second.version,
      },
    });
    expect(movedToProgress.status).toBe(200);
    const inProgress = taskSchema.parse(movedToProgress.body);
    expect(inProgress.status).toBe("IN_PROGRESS");

    const movedFirst = await request("/api/v1/views/kanban/move", {
      method: "POST",
      body: {
        projectId,
        taskId: first.id,
        status: "IN_PROGRESS",
        version: first.version,
        afterId: inProgress.id,
      },
    });
    expect(movedFirst.status).toBe(200);

    const progressView = kanbanViewSchema.parse(
      (await request(`/api/v1/views/kanban?projectId=${projectId}`)).body,
    );
    // `afterId` place la carte juste sous celle déjà en cours.
    expect(progressView.columns[1]?.tasks.map((card) => card.task.id)).toEqual([
      second.id,
      first.id,
    ]);

    const movedToDone = await request("/api/v1/views/kanban/move", {
      method: "POST",
      body: {
        projectId,
        taskId: second.id,
        status: "DONE",
        version: inProgress.version,
      },
    });
    expect(movedToDone.status).toBe(200);
    const done = taskSchema.parse(movedToDone.body);
    expect(done.status).toBe("DONE");
    expect(done.completedAt).not.toBeNull();

    const doneView = kanbanViewSchema.parse(
      (await request(`/api/v1/views/kanban?projectId=${projectId}`)).body,
    );
    expect(doneView.columns[2]?.tasks.map((card) => card.task.id)).toEqual([second.id]);

    // RF-34 : le déplacement est journalisé, donc visible sur un autre appareil.
    const pull = syncPullResponseSchema.parse(
      (await request("/api/v1/sync/pull?since=0&limit=500")).body,
    );
    const change = pull.changes.find(
      (entry) =>
        entry.entityId === second.id &&
        (entry.payload as { status?: string }).status === "DONE",
    );
    expect(change).toBeDefined();
    expect(change?.operation).toBe("UPSERT");
  });

  it("refuse une version qui ne correspond pas en 409", async () => {
    const result = await request("/api/v1/views/kanban/move", {
      method: "POST",
      body: {
        projectId,
        taskId: third.id,
        status: "IN_PROGRESS",
        version: third.version + 1,
      },
    });

    expect(result.status).toBe(409);
    expect(problemDetailsSchema.parse(result.body).code).toBe("CONFLICT_VERSION");
  });
});

describe("état erreur et isolation", () => {
  it("refuse un kanban sans projet en 400", async () => {
    const result = await request("/api/v1/views/kanban");

    expect(result.status).toBe(400);
    expect(problemDetailsSchema.parse(result.body).code).toBe("VALIDATION_FAILED");
  });

  it("ne expose ni les vues ni les déplacements d'un autre workspace", async () => {
    const projectId = await createProject("Privé");
    const task = await createTask({ title: "Carte privée", projectId });

    const other = await api.createWorkspace("views-other");
    const otherAuth = await api.bearerToken(other);

    const kanban = await api.request(`/api/v1/views/kanban?projectId=${projectId}`, {
      authorization: otherAuth,
    });
    expect(kanban.status).toBe(404);

    const move = await api.request("/api/v1/views/kanban/move", {
      method: "POST",
      authorization: otherAuth,
      body: {
        projectId,
        taskId: task.id,
        status: "DONE",
        version: task.version,
      },
    });
    expect(move.status).toBe(404);

    const today = todayViewSchema.parse(
      (await api.request("/api/v1/views/today", { authorization: otherAuth })).body,
    );
    expect(today.sections).toEqual([]);
  });
});
