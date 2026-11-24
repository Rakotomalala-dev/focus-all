import { Body, Controller, Get, Inject, Param, Post, Query } from "@nestjs/common";
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
}
