import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Node 22 sait lire un fichier `.env` nativement (`process.loadEnvFile`) : pas
// besoin d'une dépendance dotenv pour un besoin de développement local.
// Les variables déjà présentes dans l'environnement gardent la priorité, donc
// la CI et la production ne dépendent jamais d'un fichier.
let loaded = false;

export function loadRootEnv(): void {
  if (loaded || process.env.NODE_ENV === "production") {
    loaded = true;
    return;
  }
  loaded = true;

  // Le processus s'exécute soit à la racine du dépôt, soit dans `apps/api`
  // (turbo, vitest, nest). Le premier fichier trouvé gagne : un `.env` propre à
  // l'application reste possible (doc 03 §4.1).
  for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
  }
}
