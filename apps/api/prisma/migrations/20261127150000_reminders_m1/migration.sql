-- RF-50 : rappels relatifs à l'échéance, en plus des rappels absolus déjà
-- stockés dans `Task.reminders`. Le plafond de 5 est appliqué par le service,
-- pas par la base, car il porte sur la somme des deux listes.
ALTER TABLE "Task" ADD COLUMN "reminderOffsets" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- RF-51 : appareils enregistrés pour les notifications push.
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB', 'DESKTOP');

CREATE TABLE "Device" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "pushToken" VARCHAR(255),
    "deviceName" VARCHAR(80),
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Device_pushToken_key" ON "Device"("pushToken");
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RF-51 : préférences par catégorie et plage silencieuse (RF-50).
CREATE TABLE "NotificationPreference" (
    "userId" UUID NOT NULL,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailySummaryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "collaborationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursStart" VARCHAR(5),
    "quietHoursEnd" VARCHAR(5),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RF-50 : journal de livraison. `jobId` déterministe et l'unicité
-- `(taskId, triggerAt)` rendent la replanification idempotente ; un rappel
-- `SENT` n'est jamais réémis.
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'CANCELLED');

CREATE TABLE "ReminderDelivery" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "triggerAt" TIMESTAMPTZ(3) NOT NULL,
    "scheduledFor" TIMESTAMPTZ(3) NOT NULL,
    "offsetMinutes" INTEGER,
    "postponed" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMPTZ(3),
    "jobId" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReminderDelivery_jobId_key" ON "ReminderDelivery"("jobId");
CREATE UNIQUE INDEX "ReminderDelivery_taskId_triggerAt_key" ON "ReminderDelivery"("taskId", "triggerAt");
CREATE INDEX "ReminderDelivery_status_scheduledFor_idx" ON "ReminderDelivery"("status", "scheduledFor");
CREATE INDEX "ReminderDelivery_workspaceId_taskId_idx" ON "ReminderDelivery"("workspaceId", "taskId");

ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
