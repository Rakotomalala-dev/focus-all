import { Module } from "@nestjs/common";
import { loadEnv, type Env } from "./env.schema";

// Jeton d'injection explicite : la configuration est lue une seule fois, au
// démarrage, et partagée par tous les modules qui en dépendent.
export const APP_ENV = "APP_ENV";

@Module({
  providers: [{ provide: APP_ENV, useFactory: (): Env => loadEnv(process.env) }],
  exports: [APP_ENV],
})
export class AppConfigModule {}
