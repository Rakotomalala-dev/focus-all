import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
    globals: false,
    restoreMocks: true,
    // Les tests d'intégration interrogent une vraie base (distante en local) :
    // 5 s ne suffisent pas, et exécuter les fichiers en série évite d'épuiser
    // le pool de connexions de la base.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    // `prisma migrate deploy` une seule fois par exécution.
    globalSetup: ["./test/global-setup.ts"],
  },
});
