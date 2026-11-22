import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";

const DEFAULT_PORT = 4000;
const DEFAULT_ORIGIN = "http://localhost:8081";

// Une variable PORT vide, « 0 » ou non numérique ne doit pas faire écouter
// l'API sur un port aléatoire : on retombe sur 4000 (doc 03 §2.1).
function resolvePort(raw: string | undefined): number {
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  // Health exposé hors du préfixe versionné : les sondes d'infrastructure
  // appellent /health et /health/ready, pas /api/v1/health (doc 03 §2.4).
  app.setGlobalPrefix("api/v1", { exclude: ["health", "health/ready"] });

  // Aucune valeur par défaut permissive : la liste vient de CORS_ORIGINS.
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? DEFAULT_ORIGIN).split(",").map((value) => value.trim()),
    credentials: true,
  });

  app.enableShutdownHooks();

  const port = resolvePort(process.env.PORT);
  await app.listen(port, "0.0.0.0");

  Logger.log(`API démarrée sur http://localhost:${port} (préfixe /api/v1)`, "Bootstrap");
}

void bootstrap();
