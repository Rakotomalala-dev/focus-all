import { Inject, Injectable } from "@nestjs/common";
import type {
  Device,
  DevicePlatform,
  NotificationPreferences,
  RegisterDevice,
  ReminderStatus,
  UpdateDevice,
  UpdateNotificationPreferences,
} from "@focus/contracts";
import { DEFAULT_PREFERENCES, type ReminderRepository } from "./reminder.repository";
import type {
  DueDelivery,
  ReminderPlan,
  StoredDelivery,
  UserNotificationContext,
} from "./reminder.repository";
import { PrismaService } from "../../database/prisma.service";
import { uuidV7 } from "../../common/uuid-v7";

type DeviceRow = {
  readonly id: string;
  readonly platform: DevicePlatform;
  readonly pushToken: string | null;
  readonly deviceName: string | null;
  readonly notificationsEnabled: boolean;
  readonly lastSeenAt: Date;
  readonly createdAt: Date;
};

function toDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    platform: row.platform,
    pushToken: row.pushToken,
    deviceName: row.deviceName,
    notificationsEnabled: row.notificationsEnabled,
    lastSeenAt: row.lastSeenAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

type PreferenceRow = {
  readonly remindersEnabled: boolean;
  readonly dailySummaryEnabled: boolean;
  readonly collaborationEnabled: boolean;
  readonly quietHoursStart: string | null;
  readonly quietHoursEnd: string | null;
};

function toPreferences(row: PreferenceRow | null): NotificationPreferences {
  if (row === null) {
    return DEFAULT_PREFERENCES;
  }
  return {
    remindersEnabled: row.remindersEnabled,
    dailySummaryEnabled: row.dailySummaryEnabled,
    collaborationEnabled: row.collaborationEnabled,
    quietHours:
      row.quietHoursStart === null || row.quietHoursEnd === null
        ? null
        : { start: row.quietHoursStart, end: row.quietHoursEnd },
  };
}

type DeliveryRow = {
  readonly id: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly taskId: string;
  readonly triggerAt: Date;
  readonly scheduledFor: Date;
  readonly offsetMinutes: number | null;
  readonly postponed: boolean;
  readonly status: ReminderStatus;
  readonly sentAt: Date | null;
};

function toDelivery(row: DeliveryRow): StoredDelivery {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    taskId: row.taskId,
    triggerAt: row.triggerAt.toISOString(),
    scheduledFor: row.scheduledFor.toISOString(),
    offsetMinutes: row.offsetMinutes,
    postponed: row.postponed,
    status: row.status,
    sentAt: row.sentAt === null ? null : row.sentAt.toISOString(),
  };
}

@Injectable()
export class PrismaReminderRepository implements ReminderRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async userContext(userId: string): Promise<UserNotificationContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, locale: true },
    });
    return { timezone: user?.timezone ?? "Europe/Paris", locale: user?.locale ?? "fr" };
  }

  async preferences(userId: string): Promise<NotificationPreferences> {
    const row = await this.prisma.notificationPreference.findUnique({
      where: { userId },
      select: {
        remindersEnabled: true,
        dailySummaryEnabled: true,
        collaborationEnabled: true,
        quietHoursStart: true,
        quietHoursEnd: true,
      },
    });
    return toPreferences(row);
  }

  async updatePreferences(
    userId: string,
    patch: UpdateNotificationPreferences,
  ): Promise<NotificationPreferences> {
    const quiet =
      patch.quietHours === undefined
        ? undefined
        : patch.quietHours === null
          ? { quietHoursStart: null, quietHoursEnd: null }
          : { quietHoursStart: patch.quietHours.start, quietHoursEnd: patch.quietHours.end };

    const row = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        remindersEnabled: patch.remindersEnabled ?? true,
        dailySummaryEnabled: patch.dailySummaryEnabled ?? false,
        collaborationEnabled: patch.collaborationEnabled ?? true,
        ...(quiet ?? {}),
      },
      update: {
        ...(patch.remindersEnabled === undefined
          ? {}
          : { remindersEnabled: patch.remindersEnabled }),
        ...(patch.dailySummaryEnabled === undefined
          ? {}
          : { dailySummaryEnabled: patch.dailySummaryEnabled }),
        ...(patch.collaborationEnabled === undefined
          ? {}
          : { collaborationEnabled: patch.collaborationEnabled }),
        ...(quiet ?? {}),
      },
      select: {
        remindersEnabled: true,
        dailySummaryEnabled: true,
        collaborationEnabled: true,
        quietHoursStart: true,
        quietHoursEnd: true,
      },
    });
    return toPreferences(row);
  }

  async listDevices(userId: string): Promise<readonly Device[]> {
    const rows = await this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        platform: true,
        pushToken: true,
        deviceName: true,
        notificationsEnabled: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
    return rows.map(toDevice);
  }

  async upsertDevice(userId: string, input: RegisterDevice): Promise<Device> {
    const now = new Date();
    const existing =
      input.deviceId === undefined
        ? input.pushToken === undefined
          ? null
          : await this.prisma.device.findUnique({ where: { pushToken: input.pushToken } })
        : await this.prisma.device.findUnique({ where: { id: input.deviceId } });

    const data = {
      userId,
      platform: input.platform,
      pushToken: input.pushToken ?? existing?.pushToken ?? null,
      deviceName: input.deviceName ?? existing?.deviceName ?? null,
      notificationsEnabled: input.notificationsEnabled,
      lastSeenAt: now,
    };

    const row =
      existing === null
        ? await this.prisma.device.create({
            data: { id: input.deviceId ?? uuidV7(), ...data },
            select: {
              id: true,
              platform: true,
              pushToken: true,
              deviceName: true,
              notificationsEnabled: true,
              lastSeenAt: true,
              createdAt: true,
            },
          })
        : await this.prisma.device.update({
            where: { id: existing.id },
            data,
            select: {
              id: true,
              platform: true,
              pushToken: true,
              deviceName: true,
              notificationsEnabled: true,
              lastSeenAt: true,
              createdAt: true,
            },
          });
    return toDevice(row);
  }

  async updateDevice(
    userId: string,
    id: string,
    patch: UpdateDevice,
  ): Promise<Device | undefined> {
    const existing = await this.prisma.device.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (existing === null) {
      return undefined;
    }
    const row = await this.prisma.device.update({
      where: { id },
      data: {
        ...(patch.notificationsEnabled === undefined
          ? {}
          : { notificationsEnabled: patch.notificationsEnabled }),
        ...(patch.pushToken === undefined ? {} : { pushToken: patch.pushToken }),
        lastSeenAt: new Date(),
      },
      select: {
        id: true,
        platform: true,
        pushToken: true,
        deviceName: true,
        notificationsEnabled: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
    return toDevice(row);
  }

  async removeDevice(userId: string, id: string): Promise<boolean> {
    const deleted = await this.prisma.device.deleteMany({ where: { id, userId } });
    return deleted.count > 0;
  }

  async replaceDeliveries(
    taskId: string,
    workspaceId: string,
    userId: string,
    plans: readonly ReminderPlan[],
  ): Promise<void> {
    const wanted = plans.map((plan) => plan.triggerAt);
    await this.prisma.$transaction(async (tx) => {
      // Seuls les rappels en attente sont remplacés : un rappel déjà envoyé
      // reste dans le journal et ne sera jamais réémis (RF-50).
      await tx.reminderDelivery.deleteMany({
        where: {
          taskId,
          status: "PENDING",
          ...(wanted.length === 0 ? {} : { triggerAt: { notIn: wanted } }),
        },
      });

      for (const plan of plans) {
        await tx.reminderDelivery.upsert({
          where: { taskId_triggerAt: { taskId, triggerAt: plan.triggerAt } },
          create: {
            id: uuidV7(),
            workspaceId,
            userId,
            taskId,
            triggerAt: plan.triggerAt,
            scheduledFor: plan.scheduledFor,
            offsetMinutes: plan.offsetMinutes,
            postponed: plan.postponed,
            status: "PENDING",
            jobId: `reminder:${taskId}:${plan.triggerAt.toISOString()}`,
          },
          update: {
            scheduledFor: plan.scheduledFor,
            offsetMinutes: plan.offsetMinutes,
            postponed: plan.postponed,
          },
        });
      }
    });
  }

  async cancelTaskDeliveries(taskId: string): Promise<void> {
    await this.prisma.reminderDelivery.updateMany({
      where: { taskId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
  }

  async pendingDeliveries(taskId: string): Promise<readonly StoredDelivery[]> {
    const rows = await this.prisma.reminderDelivery.findMany({
      where: { taskId, status: "PENDING" },
      orderBy: { triggerAt: "asc" },
      select: {
        id: true,
        workspaceId: true,
        userId: true,
        taskId: true,
        triggerAt: true,
        scheduledFor: true,
        offsetMinutes: true,
        postponed: true,
        status: true,
        sentAt: true,
      },
    });
    return rows.map(toDelivery);
  }

  async claimDue(now: Date): Promise<readonly DueDelivery[]> {
    const candidates = await this.prisma.reminderDelivery.findMany({
      where: { status: "PENDING", scheduledFor: { lte: now } },
      orderBy: { scheduledFor: "asc" },
      take: 100,
      select: {
        id: true,
        workspaceId: true,
        userId: true,
        taskId: true,
        triggerAt: true,
        scheduledFor: true,
        offsetMinutes: true,
        postponed: true,
        status: true,
        sentAt: true,
        task: { select: { title: true, dueDate: true } },
      },
    });

    const claimed: DueDelivery[] = [];
    for (const row of candidates) {
      // Réservation conditionnelle : un second worker qui lit la même ligne
      // échoue ici, donc aucun rappel n'est envoyé deux fois.
      const updated = await this.prisma.reminderDelivery.updateMany({
        where: { id: row.id, status: "PENDING" },
        data: { status: "SENT", sentAt: now },
      });
      if (updated.count !== 1) {
        continue;
      }
      const context = await this.userContext(row.userId);
      claimed.push({
        ...toDelivery({ ...row, status: "SENT", sentAt: now }),
        taskTitle: row.task.title,
        taskDueDate: row.task.dueDate === null ? null : row.task.dueDate.toISOString().slice(0, 10),
        locale: context.locale,
      });
    }
    return claimed;
  }

  async markStatus(id: string, status: ReminderStatus, sentAt?: Date): Promise<void> {
    await this.prisma.reminderDelivery.updateMany({
      where: { id },
      data: { status, ...(sentAt === undefined ? {} : { sentAt }) },
    });
  }
}
