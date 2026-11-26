import { Inject, Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";
import { APP_ENV } from "../../config/app-config.module";
import type { Env } from "../../config/env.schema";

// Argon2id avec les coûts de doc 01 §15. `@node-rs/argon2` fournit des binaires
// précompilés (aucune chaîne de build native sur le poste), contrairement au
// paquet `argon2` : l'algorithme et les paramètres restent ceux du document.
// L'enum `Algorithm` du paquet est un const enum ambiant, interdit par
// `isolatedModules` : la valeur numérique 2 est celle d'Argon2id.
const ARGON2ID = 2;
@Injectable()
export class PasswordHasher {
  constructor(@Inject(APP_ENV) private readonly env: Env) {}

  hash(password: string): Promise<string> {
    return hash(password, {
      algorithm: ARGON2ID,
      memoryCost: this.env.ARGON2_MEMORY_KIB,
      timeCost: this.env.ARGON2_TIME_COST,
      parallelism: 1,
    });
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      // Une empreinte illisible (algorithme inconnu, ligne corrompue) ne doit
      // pas produire une 500 : c'est un échec d'authentification.
      return false;
    }
  }
}
