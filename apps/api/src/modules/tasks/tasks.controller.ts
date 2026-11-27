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
import type { Task, TaskListResponse, TrashResponse } from "@focus/contracts";
import type { AuthContext } from "../auth/auth-context";
import { CurrentAuth } from "../auth/current-auth.decorator";
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
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Task> {
    const task = await this.tasks.create(auth, body);
    reply.header("location", `/api/v1/tasks/${task.id}`);
    publishVersion(reply, task);
    return task;
  }

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: unknown): Promise<TaskListResponse> {
    return this.tasks.list(auth, query);
  }

  // Routes littérales déclarées avant `:id` : `trash` et `order` ne doivent
  // jamais être interprétés comme des UUID.
  @Get("trash")
  trash(@CurrentAuth() auth: AuthContext): Promise<TrashResponse> {
    return this.tasks.trash(auth);
  }

  @Patch("order")
  @HttpCode(200)
  reorder(@CurrentAuth() auth: AuthContext, @Body() body: unknown): Promise<readonly Task[]> {
    return this.tasks.reorder(auth, body);
  }

  @Post("inbox/empty")
  @HttpCode(200)
  emptyInbox(@CurrentAuth() auth: AuthContext, @Body() body: unknown): Promise<{ moved: number }> {
    return this.tasks.emptyInbox(auth, body);
  }

  @Get(":id")
  async findById(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Task> {
    const task = await this.tasks.findById(auth, id);
    publishVersion(reply, task);
    return task;
  }

  @Post(":id/restore")
  @HttpCode(200)
  restore(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<Task> {
    return this.tasks.restore(auth, id);
  }

  // La version attendue peut venir du corps (`version`) ou d'`If-Match`.
  @Patch(":id")
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("if-match") ifMatch: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Task> {
    const task = await this.tasks.update(auth, id, body, ifMatch);
    publishVersion(reply, task);
    return task;
  }

  // 204 sans corps : rien à renvoyer, et pas de fuite de l'entité supprimée.
  @Delete(":id")
  @HttpCode(204)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Query() query: unknown,
    @Headers("if-match") ifMatch: string | undefined,
  ): Promise<void> {
    await this.tasks.remove(auth, id, query, ifMatch);
  }
}
