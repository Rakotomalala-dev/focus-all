import { Module } from "@nestjs/common";
import { RemindersModule } from "../reminders/reminders.module";
import { TasksModule } from "../tasks/tasks.module";
import { SyncController } from "./sync.controller";
import { SyncService } from "./sync.service";

@Module({
  imports: [TasksModule, RemindersModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
