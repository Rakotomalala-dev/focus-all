import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { APP_ENV } from "./app-config.module";
import type { Env } from "./env.schema";

// Configuration HTTP commune au bootstrap et aux tests d'intégration : le
// préfixe vient de `API_PREFIX` (doc 03 §4.2) et les sondes restent hors du
// préfixe versionné (doc 03 §2.4). Un seul endroit à changer, donc aucun test
// ne peut diverger du vrai serveur.
export function applyHttpConfig(app: NestFastifyApplication): Env {
  const env = app.get<Env>(APP_ENV);

  app.setGlobalPrefix(env.API_PREFIX, { exclude: ["health", "health/ready"] });

  // Origines explicites, issues de CORS_ORIGINS : aucune valeur permissive.
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });

  return env;
}
