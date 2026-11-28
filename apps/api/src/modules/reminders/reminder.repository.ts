import { Injectable } from "@nestjs/common";
import type {
  Device,
  NotificationPreferences,
  RegisterDevice,
  ReminderDelivery,
  ReminderStatus,
  UpdateDevice,
  UpdateNotificationPreferences,
} from "@focus/contracts";
import { uuidV7 } from "../../common/uuid-v7";

export const REMINDER_REPOSITORY = "REMINDER_REPOSITORY";

// Un rappel planifié, avant écriture : l'instant visé et le décalage d'origine
// (`null` pour un rappel absolu) servent au diagnostic et à l'affichage.
export type ReminderPlan = {
  readonly triggerAt: Date;
  readonly scheduledFor: Date;
  readonly offsetMinutes: number | null;
  readonly postponed: boolean;
};

export type StoredDelivery = ReminderDelivery & {
  readonly workspaceId: string;
  readonly userId: string;
};

export type DueDelivery = StoredDelivery & {
  readonly taskTitle: string;
  readonly locale: string;
  readonly taskDueDate: string | null;
};

export type UserNotificationContext = {
  readonly timezone: string;
  readonly locale: string;
};

export interface ReminderRepository {
  userContext(userId: string): Promise<UserNotificationContext>;
  preferences(userId: string): Promise<NotificationPreferences>;
  updatePreferences(
    userId: string,
    patch: UpdateNotificationPreferences,
  ): Promise<NotificationPreferences>;
  listDevices(userId: string): Promise<readonly Device[]>;
  upsertDevice(userId: string, input: RegisterDevice): Promise<Device>;
  updateDevice(userId: string, id: string, patch: UpdateDevice): Promise<Device | undefined>;
  removeDevice(userId: string, id: string): Promise<boolean>;
  // Remplace les rappels en attente d'une tâche : les rappels déjà `SENT` sont
  // conservés, un rappel déjà envoyé pour le même instant n'est jamais rejoué.
  replaceDeliveries(
    taskId: string,
    workspaceId: string,
    userId: string,
    plans: readonly ReminderPlan[],
  ): Promise<void>;
  cancelTaskDeliveries(taskId: string): Promise<void>;
  pendingDeliveries(taskId: string): Promise<readonly StoredDelivery[]>;
  // Réserve les rappels dus de façon atomique : deux workers ne peuvent pas
  // livrer deux fois le même rappel.
  claimDue(now: Date): Promise<readonly DueDelivery[]>;
  markStatus(id: string, status: ReminderStatus, sentAt?: Date): Promise<void>;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  remindersEnabled: true,
  dailySummaryEnabled: false,
  collaborationEnabled: true,
  quietHours: null,
};

const MAX_CLAIM = 100;

// Implémentation en mémoire : elle couvre les tests unitaires et les tests
// HTTP sans PostgreSQL, comme le repository des tâches.
@Injectable()
export class InMemoryReminderRepository implements ReminderRepository {
  private readonly deliveries = new Map<string, StoredDelivery & { taskTitle: string }>();
  private readonly devices = new Map<string, Device & { userId: string }>();
  private readonly preferencesByUser = new Map<string, NotificationPreferences>();
  private contextUser: UserNotificationContext = {
    timezone: "Europe/Paris",
    locale: "fr",
  };

  static create(context?: Partial<UserNotificationContext>): InMemoryReminderRepository {
    const repository = new InMemoryReminderRepository();
    if (context !== undefined) {
      repository.contextUser = { ...repository.contextUser, ...context };
    }
    return repository;
  }

  async userContext(_userId: string): Promise<UserNotificationContext> {
    return this.contextUser;
  }

  async preferences(userId: string): Promise<NotificationPreferences> {
    return this.preferencesByUser.get(userId) ?? DEFAULT_PREFERENCES;
  }

  async updatePreferences(
    userId: string,
    patch: UpdateNotificationPreferences,
  ): Promise<NotificationPreferences> {
    const current = await this.preferences(userId);
    const next: NotificationPreferences = {
      remindersEnabled: patch.remindersEnabled ?? current.remindersEnabled,
      dailySummaryEnabled: patch.dailySummaryEnabled ?? current.dailySummaryEnabled,
      collaborationEnabled: patch.collaborationEnabled ?? current.collaborationEnabled,
      quietHours:
        patch.quietHours === undefined ? current.quietHours : patch.quietHours,
    };
    this.preferencesByUser.set(userId, next);
    return next;
  }

  async listDevices(userId: string): Promise<readonly Device[]> {
    return [...this.devices.values()]
      .filter((device) => device.userId === userId)
      .map(({ userId: _owner, ...device }) => device);
  }

  async upsertDevice(userId: string, input: RegisterDevice): Promise<Device> {
    const existing = [...this.devices.values()].find(
      (device) =>
        device.userId === userId &&
        ((input.deviceId !== undefined && device.id === input.deviceId) ||
          (input.pushToken !== undefined && device.pushToken === input.pushToken)),
    );
    const now = new Date().toISOString();
    const device: Device & { userId: string } = {
      id: existing?.id ?? input.deviceId ?? uuidV7(),
      userId,
      platform: input.platform,
      pushToken: input.pushToken ?? existing?.pushToken ?? null,
      deviceName: input.deviceName ?? existing?.deviceName ?? null,
      notificationsEnabled: input.notificationsEnabled,
      lastSeenAt: now,
      createdAt: existing?.createdAt ?? now,
    };
    this.devices.set(device.id, device);
    const { userId: _owner, ...publicDevice } = device;
    return publicDevice;
  }

  async updateDevice(
    userId: string,
    id: string,
    patch: UpdateDevice,
  ): Promise<Device | undefined> {
    const existing = this.devices.get(id);
    if (existing === undefined || existing.userId !== userId) {
      return undefined;
    }
    const next: Device & { userId: string } = {
      ...existing,
      notificationsEnabled: patch.notificationsEnabled ?? existing.notificationsEnabled,
      pushToken:
        patch.pushToken === undefined ? existing.pushToken : patch.pushToken,
      lastSeenAt: new Date().toISOString(),
    };
    this.devices.set(id, next);
    const { userId: _owner, ...publicDevice } = next;
    return publicDevice;
  }

  async removeDevice(userId: string, id: string): Promise<boolean> {
    const existing = this.devices.get(id);
    if (existing === undefined || existing.userId !== userId) {
      return false;
    }
    this.devices.delete(id);
    return true;
  }

  async replaceDeliveries(
    taskId: string,
    workspaceId: string,
    userId: string,
    plans: readonly ReminderPlan[],
  ): Promise<void> {
    const wanted = new Set(plans.map((plan) => plan.triggerAt.toISOString()));
    for (const [id, delivery] of this.deliveries) {
      if (
        delivery.taskId === taskId &&
        delivery.status === "PENDING" &&
        !wanted.has(delivery.triggerAt)
      ) {
        this.deliveries.delete(id);
      }
    }
    for (const plan of plans) {
      const triggerAt = plan.triggerAt.toISOString();
      const alreadySent = [...this.deliveries.values()].some(
        (delivery) =>
          delivery.taskId === taskId &&
          delivery.triggerAt === triggerAt &&
          delivery.status === "SENT",
      );
      const alreadyPending = [...this.deliveries.values()].some(
        (delivery) => delivery.taskId === taskId && delivery.triggerAt === triggerAt,
      );
      if (alreadySent || alreadyPending) {
        continue;
      }
      const delivery: StoredDelivery & { taskTitle: string } = {
        id: uuidV7(),
        workspaceId,
        userId,
        taskId,
        taskTitle: taskId,
        triggerAt,
        scheduledFor: plan.scheduledFor.toISOString(),
        offsetMinutes: plan.offsetMinutes,
        postponed: plan.postponed,
        status: "PENDING",
        sentAt: null,
      };
      this.deliveries.set(delivery.id, delivery);
    }
  }

  async cancelTaskDeliveries(taskId: string): Promise<void> {
    for (const [id, delivery] of this.deliveries) {
      if (delivery.taskId === taskId && delivery.status === "PENDING") {
        this.deliveries.set(id, { ...delivery, status: "CANCELLED" });
      }
    }
  }

  async pendingDeliveries(taskId: string): Promise<readonly StoredDelivery[]> {
    return [...this.deliveries.values()]
      .filter((delivery) => delivery.taskId === taskId && delivery.status === "PENDING")
      .map(({ taskTitle: _title, ...delivery }) => delivery);
  }

  async claimDue(now: Date): Promise<readonly DueDelivery[]> {
    const due = [...this.deliveries.values()]
      .filter(
        (delivery) =>
          delivery.status === "PENDING" && new Date(delivery.scheduledFor) <= now,
      )
      .sort((left, right) => (left.scheduledFor < right.scheduledFor ? -1 : 1))
      .slice(0, MAX_CLAIM);

    return due.map((delivery) => {
      this.deliveries.set(delivery.id, { ...delivery, status: "SENT", sentAt: now.toISOString() });
      return {
        ...delivery,
        status: "SENT",
        sentAt: now.toISOString(),
        locale: this.contextUser.locale,
        taskDueDate: null,
      };
    });
  }

  async markStatus(id: string, status: ReminderStatus, sentAt?: Date): Promise<void> {
    const existing = this.deliveries.get(id);
    if (existing === undefined) {
      return;
    }
    this.deliveries.set(id, {
      ...existing,
      status,
      sentAt: sentAt === undefined ? existing.sentAt : sentAt.toISOString(),
    });
  }
}
