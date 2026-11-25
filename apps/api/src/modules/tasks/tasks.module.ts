import { Module } from "@nestjs/common";
import { InMemoryTaskRepository, TASK_REPOSITORY } from "./task.repository";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";

@Module({
  controllers: [TasksController],
  providers: [
    TasksService,
    // Le service dépend du port, pas de l'implémentation : basculer sur
    // Prisma consistera à changer ce seul `useClass`.
    { provide: TASK_REPOSITORY, useClass: InMemoryTaskRepository },
  ],
})
export class TasksModule {}
