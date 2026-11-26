import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadRootEnv } from "../src/config/load-env";

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function ensureSchema(): Promise<void> {
  // `migrate deploy` prend un verrou consultatif : le relancer à chaque
  // exécution alors que rien n'est en attente rend la suite fragile sur une
  // base distante. On ne l'exécute donc que si une migration locale manque.
  const migrationsDirectory = resolve(process.cwd(), "prisma", "migrations");
  const local = readdirSync(migrationsDirectory).filter((name) => !name.endsWith(".toml"));

  const prisma = new PrismaClient();
  let applied: string[] = [];
  try {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
    `;
    applied = rows.map((row) => row.migration_name);
  } catch {
    // Table absente (base neuve) : `migrate deploy` la créera.
    applied = [];
  } finally {
    await prisma.$disconnect();
  }

  if (local.every((name) => applied.includes(name))) {
    return;
  }

  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: resolve(process.cwd()),
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
}

// Les tests HTTP utilisent la vraie base : le schéma doit être à jour avant le
// premier test, et une base absente doit échouer clairement (jamais un succès
// silencieux sur des tests sautés).
export default async function setup(): Promise<void> {
  loadRootEnv();
  if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.length === 0) {
    throw new Error(
      "DATABASE_URL est requis pour les tests d'intégration (voir .env.example, doc 03 §2.4).",
    );
  }

  // Une base distante peut refuser une connexion quelques secondes (réveil,
  // limite de pool) : trois tentatives, puis l'erreur est propagée.
  for (let attempt = 1; ; attempt += 1) {
    try {
      await ensureSchema();
      return;
    } catch (error) {
      if (attempt >= 3) {
        throw error;
      }
      await sleep(1_000 * attempt);
    }
  }
}
