import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./auth/auth.guard";
import { AuthModule } from "./auth/auth.module";
import { ProblemDetailsFilter } from "./common/problem-details.filter";
import { HealthModule } from "./health/health.module";
import { TasksModule } from "./tasks/tasks.module";

@Module({
  imports: [AuthModule, HealthModule, TasksModule],
  providers: [
    // Guard global : authentification par défaut de toute route, `@Public()`
    // pour les sondes. Le workspace vient du jeton, jamais du corps (N-3).
    { provide: APP_GUARD, useClass: AuthGuard },
    // Filtre global : toute exception sort en `application/problem+json` (N-8),
    // y compris depuis les modules ajoutés plus tard.
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
