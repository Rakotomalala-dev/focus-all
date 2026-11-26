import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import type { Project, ProjectListResponse } from "@focus/contracts";
import type { AuthContext } from "../auth/auth-context";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { ProjectsService } from "./projects.service";

function publishVersion(reply: FastifyReply, project: Project): void {
  reply.header("etag", `"${project.version}"`);
}

// Controller = transport uniquement (N-1).
@Controller("projects")
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Project> {
    const project = await this.projects.create(auth, body);
    reply.header("location", `/api/v1/projects/${project.id}`);
    publishVersion(reply, project);
    return project;
  }

  @Get()
  list(@CurrentAuth() auth: AuthContext): Promise<ProjectListResponse> {
    return this.projects.list(auth);
  }

  @Get(":id")
  async findById(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Project> {
    const project = await this.projects.findById(auth, id);
    publishVersion(reply, project);
    return project;
  }

  @Patch(":id")
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("if-match") ifMatch: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Project> {
    const project = await this.projects.update(auth, id, body, ifMatch);
    publishVersion(reply, project);
    return project;
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Query() query: unknown,
    @Headers("if-match") ifMatch: string | undefined,
  ): Promise<void> {
    await this.projects.remove(auth, id, query, ifMatch);
  }
}
