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
} from "@nestjs/common";
import type { Task, TaskListResponse } from "@focus/contracts";
import { TasksService } from "./tasks.service";

// Controller = transport uniquement (N-1) : aucune règle métier, aucune
// validation ici, tout est délégué au service.
@Controller("tasks")
export class TasksController {
  // Jeton explicite, même raison que dans HealthController (TS-4).
  constructor(@Inject(TasksService) private readonly tasks: TasksService) {}

  @Post()
  create(@Body() body: unknown): Promise<Task> {
    return this.tasks.create(body);
  }

  @Get()
  list(@Query() query: unknown): Promise<TaskListResponse> {
    return this.tasks.list(query);
  }

  @Get(":id")
  findById(@Param("id") id: string): Promise<Task> {
    return this.tasks.findById(id);
  }

  // La version attendue peut venir du corps (`version`) ou d'`If-Match`.
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("if-match") ifMatch: string | undefined,
  ): Promise<Task> {
    return this.tasks.update(id, body, ifMatch);
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
