import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import {
  DAY_OVERLOAD_MINUTES,
  DAY_OVERLOAD_TASKS,
  KANBAN_STATUSES,
  UPCOMING_DAYS,
  calendarQuerySchema,
  kanbanMoveSchema,
  kanbanQuerySchema,
  todayQuerySchema,
  upcomingQuerySchema,
  type CalendarView,
  type KanbanView,
  type Task,
  type TodaySection,
  type TodaySectionKey,
  type TodayView,
  type UpcomingView,
  type ViewCard,
} from "@focus/contracts";
import { DomainError } from "../../common/domain-error";
import { localDateIn } from "../../common/local-date";
import { describeIssues } from "../../common/zod-issues";
import type { AuthContext } from "../auth/auth-context";
import { MAX_RECURRENCE_OCCURRENCES, nextOccurrence } from "../tasks/recurrence";
import { TASK_REPOSITORY, priorityRank, type TaskRepository } from "../tasks/task.repository";
import { VIEWS_REPOSITORY, type ViewTaskRow, type ViewsRepository } from "./views.repository";

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function addDays(value: string, days: number): string {
  return isoDay(new Date(parseDay(value).getTime() + days * DAY_MS));
}

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let current = from; current <= to; current = addDays(current, 1)) {
    days.push(current);
  }
  return days;
}

function monthRange(anchor: string): { from: string; to: string } {
  const date = parseDay(anchor);
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return { from: isoDay(first), to: isoDay(last) };
}

// Semaine ISO : lundi → dimanche, indépendamment du fuseau du serveur.
function weekRange(anchor: string): { from: string; to: string } {
  const date = parseDay(anchor);
  const weekday = date.getUTCDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  const from = addDays(anchor, -offset);
  return { from, to: addDays(from, 6) };
}

function estimateOf(cards: readonly ViewCard[]): number {
  return cards.reduce((sum, card) => sum + (card.task.estimateMinutes ?? 0), 0);
}

// RF-31 : ordre déterministe — priorité, puis échéance, puis `sortOrder`.
// Les cartes sans échéance passent en dernier.
function compareCards(left: ViewCard, right: ViewCard): number {
  const priority = priorityRank(right.task.priority) - priorityRank(left.task.priority);
  if (priority !== 0) return priority;

  if (left.occurrenceDate !== right.occurrenceDate) {
    if (left.occurrenceDate === null) return 1;
    if (right.occurrenceDate === null) return -1;
    return left.occurrenceDate < right.occurrenceDate ? -1 : 1;
  }
  if (left.task.sortOrder !== right.task.sortOrder) {
    return left.task.sortOrder < right.task.sortOrder ? -1 : 1;
  }
  return left.task.id < right.task.id ? -1 : left.task.id > right.task.id ? 1 : 0;
}

// Vue calendrier : les tâches horodatées d'abord, par heure, puis l'ordre
// habituel. Aucune heure = journée entière, donc en fin de liste.
function compareCalendar(left: ViewCard, right: ViewCard): number {
  const leftTime = left.task.dueTime ?? null;
  const rightTime = right.task.dueTime ?? null;
  if (leftTime !== rightTime) {
    if (leftTime === null) return 1;
    if (rightTime === null) return -1;
    return leftTime < rightTime ? -1 : 1;
  }
  return compareCards(left, right);
}

function isActive(task: Task): boolean {
  return task.status !== "DONE" && task.status !== "CANCELLED";
}

@Injectable()
export class ViewsService {
  constructor(
    @Inject(VIEWS_REPOSITORY) private readonly views: ViewsRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
  ) {}

  // Construit une carte par tâche, avec l'avancement de ses sous-tâches.
  private async cardMap(
    workspaceId: string,
    rows: readonly ViewTaskRow[],
  ): Promise<Map<string, ViewCard>> {
    const subtasks = await this.views.subtasks(
      workspaceId,
      rows.map((row) => row.task.id),
    );
    return new Map(
      rows.map((row) => [
        row.task.id,
        {
          task: row.task,
          projectName: row.projectName,
          subtaskCount: subtasks.get(row.task.id)?.total ?? 0,
          subtaskDoneCount: subtasks.get(row.task.id)?.done ?? 0,
          occurrenceDate: row.task.dueDate ?? null,
        },
      ]),
    );
  }

  private section(
    key: TodaySectionKey,
    cards: readonly ViewCard[],
  ): TodaySection | null {
    if (cards.length === 0) return null;
    return {
      key,
      tasks: [...cards].sort(compareCards),
      count: cards.length,
      estimateMinutes: estimateOf(cards),
      collapsedByDefault: key === "COMPLETED",
    };
  }

  // RF-31 — un agrégat unique et ordonné. Les sections vides sont omises :
  // l'écran n'affiche pas de bloc vide, et l'absence totale de section devient
  // l'état vide côté client.
  async today(auth: AuthContext, rawQuery: unknown): Promise<TodayView> {
    const parsed = todayQuerySchema.safeParse(rawQuery ?? {});
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }
    const today = localDateIn(await this.tasks.userTimezone(auth.userId));
    const date = parsed.data.date ?? today;
    const horizon = addDays(date, UPCOMING_DAYS - 1);

    const rows = await this.views.tasksForWindow(auth.workspaceId, date, horizon);
    const cards = [...(await this.cardMap(auth.workspaceId, rows)).values()];
    const active = cards.filter((card) => isActive(card.task));

    const overdue = active.filter(
      (card) => card.task.dueDate !== undefined && card.task.dueDate < date,
    );
    const dueToday = active.filter((card) => card.task.dueDate === date);

    const shown = new Set([...overdue, ...dueToday].map((card) => card.task.id));
    // Travail déjà lancé pour les jours qui viennent : il ne réapparaît pas
    // dans les sections de retard ni du jour.
    const inProgress = active.filter(
      (card) =>
        card.task.status === "IN_PROGRESS" &&
        card.task.dueDate !== undefined &&
        card.task.dueDate > date &&
        card.task.dueDate <= horizon &&
        !shown.has(card.task.id),
    );
    for (const card of inProgress) shown.add(card.task.id);

    const pinned = active.filter(
      (card) => card.task.pinned && !shown.has(card.task.id),
    );

    const completed = cards.filter(
      (card) =>
        card.task.status === "DONE" &&
        card.task.completedAt !== null &&
        card.task.completedAt.slice(0, 10) === date,
    );

    const sections = [
      this.section("OVERDUE", overdue),
      this.section("TODAY", dueToday),
      this.section("IN_PROGRESS", inProgress),
      this.section("PINNED", pinned),
      this.section("COMPLETED", completed),
    ].filter((section): section is TodaySection => section !== null);

    const loadCards = [...overdue, ...dueToday, ...inProgress, ...pinned];

    return {
      date,
      sections,
      loadMinutes: estimateOf(loadCards),
      loadTaskCount: loadCards.length,
    };
  }

  // RF-32 — sept jours glissants, un en-tête de charge par jour et un drapeau
  // de surcharge (> 8 h estimées ou > 12 tâches).
  async upcoming(auth: AuthContext, rawQuery: unknown): Promise<UpcomingView> {
    const parsed = upcomingQuerySchema.safeParse(rawQuery ?? {});
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }
    const from =
      parsed.data.date ?? localDateIn(await this.tasks.userTimezone(auth.userId));
    const to = addDays(from, UPCOMING_DAYS - 1);

    const rows = await this.views.tasksForWindow(auth.workspaceId, from, to);
    const cards = [...(await this.cardMap(auth.workspaceId, rows)).values()].filter(
      (card) =>
        isActive(card.task) &&
        card.task.dueDate !== undefined &&
        card.task.dueDate >= from &&
        card.task.dueDate <= to,
    );

    const days = daysBetween(from, to).map((date) => {
      const tasks = cards
        .filter((card) => card.task.dueDate === date)
        .sort(compareCards);
      const estimateMinutes = estimateOf(tasks);
      return {
        date,
        tasks,
        count: tasks.length,
        estimateMinutes,
        overloaded:
          estimateMinutes > DAY_OVERLOAD_MINUTES || tasks.length > DAY_OVERLOAD_TASKS,
      };
    });

    return { from, to, days };
  }

  // RF-33 — mois ou semaine en lecture seule. Les occurrences récurrentes
  // futures sont calculées ici et jamais écrites en base.
  async calendar(auth: AuthContext, rawQuery: unknown): Promise<CalendarView> {
    const parsed = calendarQuerySchema.safeParse(rawQuery ?? {});
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }
    const anchor =
      parsed.data.anchor ?? localDateIn(await this.tasks.userTimezone(auth.userId));
    const { from, to } =
      parsed.data.mode === "MONTH" ? monthRange(anchor) : weekRange(anchor);

    const rows = await this.views.tasksForWindow(auth.workspaceId, from, to);
    const cards = await this.cardMap(auth.workspaceId, rows);
    const entries = new Map<string, ViewCard>();

    for (const card of cards.values()) {
      if (card.task.status === "CANCELLED") continue;
      if (
        card.task.dueDate !== undefined &&
        card.task.dueDate >= from &&
        card.task.dueDate <= to
      ) {
        entries.set(`${card.task.id}:${card.task.dueDate}`, card);
      }
    }

    for (const row of rows) {
      const task = row.task;
      if (task.recurrenceRule === undefined || task.dueDate === undefined) continue;
      // En mode « après complétion », les dates futures dépendent de la
      // complétion : elles ne peuvent pas être calculées à l'avance.
      if (task.recurrenceMode !== "FIXED") continue;

      const card = cards.get(task.id);
      if (card === undefined) continue;

      let current = task.dueDate;
      for (let step = 0; step < MAX_RECURRENCE_OCCURRENCES; step += 1) {
        const next = nextOccurrence(task.recurrenceRule, current, "FIXED", current);
        if (next <= current || next > to) break;
        current = next;
        if (current < from) continue;
        const key = `${task.id}:${current}`;
        if (!entries.has(key)) {
          entries.set(key, { ...card, occurrenceDate: current });
        }
      }
    }

    const days = daysBetween(from, to).map((date) => {
      const tasks = [...entries.values()]
        .filter((card) => card.occurrenceDate === date)
        .sort(compareCalendar);
      return {
        date,
        tasks,
        count: tasks.length,
        estimateMinutes: estimateOf(tasks),
      };
    });

    return { mode: parsed.data.mode, anchor, from, to, days };
  }

  // RF-34 — colonnes fixes, par projet, ordre de carte stable.
  async kanban(auth: AuthContext, rawQuery: unknown): Promise<KanbanView> {
    const parsed = kanbanQuerySchema.safeParse(rawQuery ?? {});
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }
    const project = await this.views.findProject(auth.workspaceId, parsed.data.projectId);
    if (project === undefined) {
      throw new DomainError("project.not_found");
    }

    const rows = await this.views.kanbanTasks(auth.workspaceId, project.id);
    const cards = await this.cardMap(auth.workspaceId, rows);
    const ordered = rows
      .map((row) => cards.get(row.task.id))
      .filter((card): card is ViewCard => card !== undefined);

    return {
      projectId: project.id,
      projectName: project.name,
      columns: KANBAN_STATUSES.map((status) => {
        const tasks = ordered.filter((card) => card.task.status === status);
        return { status, tasks, count: tasks.length };
      }),
    };
  }

  // RF-34 — déposer une carte change son statut et sa position. La transaction
  // du repository écrit aussi le journal de synchronisation, donc l'autre
  // appareil voit le déplacement au prochain `sync/pull`.
  async move(auth: AuthContext, rawBody: unknown): Promise<Task> {
    const parsed = kanbanMoveSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }
    const { projectId, taskId, status, version, afterId, beforeId } = parsed.data;

    if (afterId === taskId || beforeId === taskId) {
      throw new DomainError("request.invalid_field", { field: "afterId" });
    }

    const project = await this.views.findProject(auth.workspaceId, projectId);
    if (project === undefined) {
      throw new DomainError("project.not_found");
    }

    const task = await this.tasks.findById(taskId, auth.workspaceId);
    if (task === undefined || task.projectId !== projectId) {
      throw new DomainError("task.not_found");
    }

    const result = await this.tasks.moveOnBoard(
      taskId,
      auth.workspaceId,
      version,
      status,
      { afterId: afterId ?? null, beforeId: beforeId ?? null },
      { actorId: auth.userId },
    );

    if (result.status === "not_found") {
      throw new DomainError("task.not_found");
    }
    if (result.status === "conflict") {
      throw new DomainError("task.version_mismatch", {
        currentVersion: result.currentVersion,
      });
    }
    return result.task;
  }
}
