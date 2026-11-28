import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

export const ACCOUNT_PURGE_STORE = "ACCOUNT_PURGE_STORE";
export const ACCOUNT_RETENTION_DAYS = 30;
const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface AccountPurgeStore {
  // Retourne le nombre de comptes physiquement supprimés avant `cutoff`.
  purgeDeletedBefore(cutoff: Date): Promise<number>;
}

@Injectable()
export class PrismaAccountPurgeStore implements AccountPurgeStore {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async purgeDeletedBefore(cutoff: Date): Promise<number> {
    // La cascade PostgreSQL supprime workspaces, tâches, projets, sessions et
    // jetons ; le `deletedAt` est la seule condition de rétention (RF-06).
    const deleted = await this.prisma.user.deleteMany({
      where: { deletedAt: { not: null, lte: cutoff } },
    });
    return deleted.count;
  }
}

@Injectable()
export class AccountPurgeService {
  constructor(@Inject(ACCOUNT_PURGE_STORE) private readonly store: AccountPurgeStore) {}

  async purgeExpired(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - ACCOUNT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    return this.store.purgeDeletedBefore(cutoff);
  }
}

// RF-06 : job quotidien embarqué, en complément du script `db:purge` pour les
// hébergeurs qui préfèrent un ordonnanceur externe. En test, aucun timer.
@Injectable()
export class AccountPurgeWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountPurgeWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(@Inject(AccountPurgeService) private readonly purge: AccountPurgeService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") {
      return;
    }
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, RUN_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const count = await this.purge.purgeExpired();
      if (count > 0) {
        this.logger.log(`${count} compte(s) purgé(s) après 30 jours.`);
      }
    } catch (error) {
      this.logger.warn(
        `Purge des comptes interrompue: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }
}
