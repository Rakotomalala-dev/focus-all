import type { Task } from "@focus/contracts";
import type { NotificationPreferences } from "@focus/contracts";
import type { NotificationsApi } from "./notification-api";
import type { PushAdapter } from "./push-registration";
import { planLocalReminders } from "./reminder-planning";

// Orchestration des rappels locaux (RF-50) : la planification n'a lieu que si
// la catégorie « rappels » et la permission système sont actives. Une tâche
// terminée, annulée ou sans rappel futur voit ses notifications annulées.
export type ReminderScheduler = {
  readonly cancelAll: () => Promise<void>;
  readonly cancelTask: (taskId: string) => Promise<void>;
  readonly schedule: (input: {
    readonly taskId: string;
    readonly title: string;
    readonly body: string;
    readonly postponedBody: string;
    readonly plans: ReturnType<typeof planLocalReminders>;
  }) => Promise<number>;
};

export type ReminderSyncDeps = {
  readonly api: Pick<NotificationsApi, "preferences">;
  readonly scheduler: ReminderScheduler;
  readonly push: Pick<PushAdapter, "getPermission">;
  readonly timezone: () => string;
  readonly now: () => Date;
  readonly translate: (key: "notifications.body" | "notifications.postponed") => string;
};

export type ReminderSync = {
  readonly syncTask: (task: Task) => Promise<number>;
  readonly syncAll: (tasks: readonly Task[]) => Promise<number>;
  readonly cancelAll: () => Promise<void>;
  readonly cancelTask: (taskId: string) => Promise<void>;
};

export function createReminderSync(deps: ReminderSyncDeps): ReminderSync {
  async function syncTask(task: Task): Promise<number> {
    if (task.status === "DONE" || task.status === "CANCELLED") {
      await deps.scheduler.cancelTask(task.id);
      return 0;
    }

    const preferences: NotificationPreferences = await deps.api.preferences();
    if (!preferences.remindersEnabled) {
      await deps.scheduler.cancelTask(task.id);
      return 0;
    }

    const permission = await deps.push.getPermission();
    if (permission !== "granted") {
      // Sans permission, les anciennes notifications planifiées ne doivent pas
      // survivre à un changement d'échéance.
      await deps.scheduler.cancelTask(task.id);
      return 0;
    }

    const plans = planLocalReminders(task, {
      timezone: deps.timezone(),
      quietHours: preferences.quietHours,
      now: deps.now(),
    });

    await deps.scheduler.cancelTask(task.id);
    if (plans.length === 0) {
      return 0;
    }

    return deps.scheduler.schedule({
      taskId: task.id,
      title: task.title,
      body: deps.translate("notifications.body"),
      postponedBody: deps.translate("notifications.postponed"),
      plans,
    });
  }

  return {
    syncTask,

    syncAll: async (tasks) => {
      let scheduled = 0;
      for (const task of tasks) {
        scheduled += await syncTask(task);
      }
      return scheduled;
    },

    cancelAll: () => deps.scheduler.cancelAll(),

    cancelTask: (taskId) => deps.scheduler.cancelTask(taskId),
  };
}
