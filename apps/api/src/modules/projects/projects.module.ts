import { Module } from "@nestjs/common";
import { PrismaProjectRepository } from "./prisma-project.repository";
import { PROJECT_REPOSITORY } from "./project.repository";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, { provide: PROJECT_REPOSITORY, useClass: PrismaProjectRepository }],
  exports: [PROJECT_REPOSITORY],
})
export class ProjectsModule {}
