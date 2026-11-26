import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { applyHttpConfig } from "./config/http";
import { loadRootEnv } from "./config/load-env";

async function bootstrap(): Promise<void> {
  // `.env` local (jamais en production, où l'environnement système fait foi).
  loadRootEnv();
  // La configuration est validée pendant la création de l'application (module
  // `AppConfigModule`) : une variable absente ou invalide empêche le boot.
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  const env = applyHttpConfig(app);

  app.enableShutdownHooks();
  await app.listen(env.PORT, "0.0.0.0");

  Logger.log(
    `API démarrée sur http://localhost:${env.PORT} (préfixe ${env.API_PREFIX})`,
    "Bootstrap",
  );
}

void bootstrap();
