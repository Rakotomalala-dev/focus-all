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
import type { Task, TaskListResponse } from "@focus/contracts";
import { TasksService } from "./tasks.service";

// La version est publiée en `ETag` : c'est la source que le client renvoie
// dans `If-Match`, ce qui rend le 412 possible sans lire le corps de réponse.
function publishVersion(reply: FastifyReply, task: Task): void {
  reply.header("etag", `"${task.version}"`);
}

// Controller = transport uniquement (N-1) : aucune règle métier, aucune
// validation ici, tout est délégué au service.
@Controller("tasks")
export class TasksController {
  // Jeton explicite, même raison que dans HealthController (TS-4).
  constructor(@Inject(TasksService) private readonly tasks: TasksService) {}

  @Post()
  async create(
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Task> {
    const task = await this.tasks.create(body);
    reply.header("location", `/api/v1/tasks/${task.id}`);
    publishVersion(reply, task);
    return task;
  }

  @Get()
  list(@Query() query: unknown): Promise<TaskListResponse> {
    return this.tasks.list(query);
  }

  @Get(":id")
  async findById(
    @Param("id") id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Task> {
    const task = await this.tasks.findById(id);
    publishVersion(reply, task);
    return task;
  }

  // La version attendue peut venir du corps (`version`) ou d'`If-Match`.
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("if-match") ifMatch: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Task> {
    const task = await this.tasks.update(id, body, ifMatch);
    publishVersion(reply, task);
    return task;
  }

  // 204 sans corps : rien à renvoyer, et pas de fuite de l'entité supprimée.
  @Delete(":id")
  @HttpCode(204)
  async remove(
    @Param("id") id: string,
    @Query() query: unknown,
    @Headers("if-match") ifMatch: string | undefined,
  ): Promise<void> {
    await this.tasks.remove(id, query, ifMatch);
  }
}
