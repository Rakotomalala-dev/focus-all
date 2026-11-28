import { Module } from "@nestjs/common";
import { AppConfigModule } from "../../config/app-config.module";
import { AuthModule } from "../auth/auth.module";
import { RemindersModule } from "../reminders/reminders.module";
import { ExportController } from "./export.controller";
import { EXPORT_STORE, PrismaExportStore } from "./export.repository";
import { ExportService } from "./export.service";
import { ExportWorker } from "./export.worker";

@Module({
  imports: [AppConfigModule, AuthModule, RemindersModule],
  controllers: [ExportController],
  providers: [
    ExportService,
    ExportWorker,
    { provide: EXPORT_STORE, useClass: PrismaExportStore },
  ],
})
export class ExportsModule {}
