import { Module } from "@nestjs/common";
import { TasksModule } from "../tasks/tasks.module";
import { PrismaViewsRepository } from "./prisma-views.repository";
import { ViewsController } from "./views.controller";
import { VIEWS_REPOSITORY } from "./views.repository";
import { ViewsService } from "./views.service";

@Module({
  imports: [TasksModule],
  controllers: [ViewsController],
  providers: [
    ViewsService,
    // Les vues lisent les tâches avec le même port d'écriture que le module
    // tâches : le déplacement d'une carte écrit le journal de synchronisation.
    { provide: VIEWS_REPOSITORY, useClass: PrismaViewsRepository },
  ],
})
export class ViewsModule {}
