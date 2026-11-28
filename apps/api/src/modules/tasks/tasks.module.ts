import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module";
import { RemindersModule } from "../reminders/reminders.module";
import { TagsModule } from "../tags/tags.module";
import { PrismaTaskRepository } from "./prisma-task.repository";
import { TASK_REPOSITORY } from "./task.repository";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";
import {
  TRASH_PURGE_STORE,
  PrismaTrashPurgeStore,
  TrashPurgeService,
  TrashPurgeWorker,
} from "./trash-purge.service";

@Module({
  imports: [ProjectsModule, TagsModule, RemindersModule],
  controllers: [TasksController],
  providers: [
    TasksService,
    TrashPurgeService,
    TrashPurgeWorker,
    { provide: TRASH_PURGE_STORE, useClass: PrismaTrashPurgeStore },
    // Le service dépend du port, pas de l'implémentation : les tests unitaires
    // injectent le repository en mémoire, la production utilise PostgreSQL.
    { provide: TASK_REPOSITORY, useClass: PrismaTaskRepository },
  ],
  // Le module sync réutilise le même port : une seule règle d'écriture, donc
  // un seul journal, quel que soit le chemin (REST ou push hors ligne).
  exports: [TASK_REPOSITORY],
})
export class TasksModule {}
