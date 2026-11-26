import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AppConfigModule } from "./config/app-config.module";
import { ProblemDetailsFilter } from "./common/problem-details.filter";
import { DatabaseModule } from "./database/database.module";
import { AuthGuard } from "./modules/auth/auth.guard";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { SyncModule } from "./modules/sync/sync.module";
import { TasksModule } from "./modules/tasks/tasks.module";

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AuthModule,
    HealthModule,
    ProjectsModule,
    TasksModule,
    SyncModule,
  ],
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
