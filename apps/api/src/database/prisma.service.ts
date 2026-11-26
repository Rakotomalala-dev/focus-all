import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

// Une base distante (Neon, etc.) peut refuser une connexion pendant quelques
// secondes après une mise en veille. Trois tentatives espacées évitent de
// transformer une indisponibilité transitoire en échec de démarrage, sans
// masquer une base réellement absente (le troisième échec est propagé).
const CONNECT_ATTEMPTS = 3;
const CONNECT_BACKOFF_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Une seule instance de PrismaClient par processus : elle gère le pool de
// connexions. Le cycle de vie suit celui de Nest (connect au boot, disconnect à
// l'arrêt), sinon les tests d'intégration laissent des sockets ouvertes.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await this.$connect();
        return;
      } catch (error) {
        if (attempt >= CONNECT_ATTEMPTS) {
          throw error;
        }
        await sleep(CONNECT_BACKOFF_MS * attempt);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
