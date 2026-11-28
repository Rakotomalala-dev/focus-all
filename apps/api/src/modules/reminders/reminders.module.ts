import { Module } from "@nestjs/common";
import { ExpoPushSender, PUSH_SENDER } from "./expo-push.sender";
import { PrismaReminderRepository } from "./prisma-reminder.repository";
import { REMINDER_REPOSITORY } from "./reminder.repository";
import { RemindersController } from "./reminders.controller";
import { RemindersService } from "./reminders.service";
import { RemindersWorker } from "./reminders.worker";

@Module({
  controllers: [RemindersController],
  providers: [
    RemindersService,
    RemindersWorker,
    { provide: REMINDER_REPOSITORY, useClass: PrismaReminderRepository },
    { provide: PUSH_SENDER, useClass: ExpoPushSender },
  ],
  // Les tâches replanifient leurs rappels après chaque écriture (RF-50).
  exports: [RemindersService],
})
export class RemindersModule {}
