import { Body, Controller, Get, HttpCode, Inject, Post, Query } from "@nestjs/common";
import type {
  CalendarView,
  KanbanView,
  Task,
  TodayView,
  UpcomingView,
} from "@focus/contracts";
import type { AuthContext } from "../auth/auth-context";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { ViewsService } from "./views.service";

// Controller = transport uniquement (N-1) : parsing et règles vivent dans le
// service. Toutes les vues sont en lecture, sauf le déplacement d'une carte.
@Controller("views")
export class ViewsController {
  constructor(@Inject(ViewsService) private readonly views: ViewsService) {}

  @Get("today")
  today(@CurrentAuth() auth: AuthContext, @Query() query: unknown): Promise<TodayView> {
    return this.views.today(auth, query);
  }

  @Get("upcoming")
  upcoming(
    @CurrentAuth() auth: AuthContext,
    @Query() query: unknown,
  ): Promise<UpcomingView> {
    return this.views.upcoming(auth, query);
  }

  @Get("calendar")
  calendar(
    @CurrentAuth() auth: AuthContext,
    @Query() query: unknown,
  ): Promise<CalendarView> {
    return this.views.calendar(auth, query);
  }

  @Get("kanban")
  kanban(@CurrentAuth() auth: AuthContext, @Query() query: unknown): Promise<KanbanView> {
    return this.views.kanban(auth, query);
  }

  @Post("kanban/move")
  @HttpCode(200)
  move(@CurrentAuth() auth: AuthContext, @Body() body: unknown): Promise<Task> {
    return this.views.move(auth, body);
  }
}
