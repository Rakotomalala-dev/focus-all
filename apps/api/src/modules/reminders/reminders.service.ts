import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import {
  MAX_TASK_REMINDERS,
  updateNotificationPreferencesSchema,
  updateDeviceSchema,
  registerDeviceSchema,
  uuidSchema,
  type Device,
  type NotificationPreferences,
  type RegisterDevice,
  type Task,
  type UpdateDevice,
  type UpdateNotificationPreferences,
} from "@focus/contracts";
import { DomainError } from "../../common/domain-error";
import { describeIssues } from "../../common/zod-issues";
import type { AuthContext } from "../auth/auth-context";
import { PUSH_SENDER, type PushSender } from "./expo-push.sender";
import type { ReminderPlan, ReminderRepository } from "./reminder.repository";
import { REMINDER_REPOSITORY } from "./reminder.repository";
import { dueInstant, shiftOutOfQuietHours } from "./reminder-time";

// RF-50 : construit les rappels effectifs d'une tâche (absolus + relatifs),
// dédoublonnés par instant, puis décalés hors de la plage silencieuse.
export function planReminders(
  task: Pick<Task, "reminders" | "reminderOffsets" | "dueDate" | "dueTime">,
  timezone: string,
  quietHours: NotificationPreferences["quietHours"],
): readonly ReminderPlan[] {
  const instants = new Map<string, number | null>();

  for (const reminder of task.reminders) {
    instants.set(new Date(reminder).toISOString(), null);
  }

  if (task.dueDate !== undefined) {
    const due = dueInstant(task.dueDate, task.dueTime, timezone);
    for (const offset of task.reminderOffsets) {
      const triggerAt = new Date(due.getTime() - offset * 60_000);
      const key = triggerAt.toISOString();
      if (!instants.has(key)) {
        instants.set(key, offset);
      }
    }
  }

  return [...instants.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([iso, offsetMinutes]) => {
      const triggerAt = new Date(iso);
      const shifted = shiftOutOfQuietHours(triggerAt, quietHours, timezone);
      return {
        triggerAt,
        scheduledFor: shifted.scheduledFor,
        postponed: shifted.postponed,
        offsetMinutes,
      };
    });
}

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @Inject(REMINDER_REPOSITORY) private readonly reminders: ReminderRepository,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
  ) {}

  // Appelé après chaque création/mise à jour de tâche : la replanification est
  // idempotente, donc un simple recalcul suffit (doc 01 §13).
  async scheduleTask(task: Task, owner: { userId: string; workspaceId: string }): Promise<void> {
    const context = await this.reminders.userContext(owner.userId);
    const preferences = await this.reminders.preferences(owner.userId);
    const plans = planReminders(task, context.timezone, preferences.quietHours);
    await this.reminders.replaceDeliveries(
      task.id,
      owner.workspaceId,
      owner.userId,
      plans,
    );
  }

  async cancelTask(taskId: string): Promise<void> {
    await this.reminders.cancelTaskDeliveries(taskId);
  }

  // Livre les rappels échus. Retourne le nombre effectivement traité pour que
  // les tests et le worker puissent l'observer.
  async dispatchDue(now: Date = new Date()): Promise<number> {
    const due = await this.reminders.claimDue(now);
    if (due.length === 0) {
      return 0;
    }

    let delivered = 0;
    for (const reminder of due) {
      const preferences = await this.reminders.preferences(reminder.userId);
      if (!preferences.remindersEnabled) {
        continue;
      }

      const devices = await this.reminders.listDevices(reminder.userId);
      const tokens = devices
        .filter((device) => device.notificationsEnabled && device.pushToken !== null)
        .map((device) => device.pushToken)
        .filter((token): token is string => token !== null);

      if (tokens.length === 0) {
        continue;
      }

      const postponedLabel =
        reminder.locale === "en" ? "Postponed reminder" : "Rappel reporté";
      const title = reminder.postponed
        ? `${postponedLabel} · ${reminder.taskTitle}`
        : reminder.taskTitle;

      try {
        await this.push.send(
          tokens.map((token) => ({
            to: token,
            title,
            body: reminder.locale === "en" ? "A task is due soon." : "Une tâche arrive à échéance.",
            data: { taskId: reminder.taskId },
          })),
        );
        delivered += 1;
      } catch (error) {
        // Un push en échec n'est pas rejoué indéfiniment : le rappel local de
        // l'appareil reste la source de vérité côté client (RF-50).
        this.logger.warn(`Push non délivré pour la tâche ${reminder.taskId}: ${String(error)}`);
      }
    }
    return delivered;
  }

  async getPreferences(auth: AuthContext): Promise<NotificationPreferences> {
    return this.reminders.preferences(auth.userId);
  }

  async updatePreferences(
    auth: AuthContext,
    rawBody: unknown,
  ): Promise<NotificationPreferences> {
    const parsed = updateNotificationPreferencesSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }
    if (Object.keys(parsed.data).length === 0) {
      throw new DomainError("request.empty_patch");
    }
    return this.reminders.updatePreferences(auth.userId, parsed.data);
  }

  async listDevices(auth: AuthContext): Promise<readonly Device[]> {
    return this.reminders.listDevices(auth.userId);
  }

  async registerDevice(auth: AuthContext, rawBody: unknown): Promise<Device> {
    const parsed = registerDeviceSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }
    const input: RegisterDevice = parsed.data;
    return this.reminders.upsertDevice(auth.userId, input);
  }

  async updateDevice(
    auth: AuthContext,
    rawId: string,
    rawBody: unknown,
  ): Promise<Device> {
    const parsedId = uuidSchema.safeParse(rawId);
    if (!parsedId.success) {
      throw new DomainError("request.invalid_field", { field: "id" });
    }
    const parsed = updateDeviceSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }
    const patch: UpdateDevice = parsed.data;
    if (Object.keys(patch).length === 0) {
      throw new DomainError("request.empty_patch");
    }
    const device = await this.reminders.updateDevice(auth.userId, parsedId.data, patch);
    if (device === undefined) {
      throw new DomainError("notification.device_not_found");
    }
    return device;
  }

  async removeDevice(auth: AuthContext, rawId: string): Promise<void> {
    const parsedId = uuidSchema.safeParse(rawId);
    if (!parsedId.success) {
      throw new DomainError("request.invalid_field", { field: "id" });
    }
    const removed = await this.reminders.removeDevice(auth.userId, parsedId.data);
    if (!removed) {
      throw new DomainError("notification.device_not_found");
    }
  }

  // Validation de création/mise à jour : le plafond de 5 porte sur la somme des
  // rappels absolus et relatifs, et un rappel relatif exige une échéance.
  static assertReminderBudget(
    reminders: readonly string[],
    offsets: readonly number[],
    dueDate: string | undefined,
  ): void {
    if (reminders.length + offsets.length > MAX_TASK_REMINDERS) {
      throw new DomainError("task.reminder_limit", {
        max: MAX_TASK_REMINDERS,
      });
    }
    if (offsets.length > 0 && dueDate === undefined) {
      throw new DomainError("task.reminder_requires_due_date");
    }
  }
}
