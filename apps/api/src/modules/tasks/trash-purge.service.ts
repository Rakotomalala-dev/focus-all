import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

export const TRASH_PURGE_STORE = "TRASH_PURGE_STORE";
export const TRASH_RETENTION_DAYS = 30;
const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type TrashPurgeCounts = {
  readonly tasks: number;
  readonly projects: number;
};

export interface TrashPurgeStore {
  // Supprime physiquement ce qui est en corbeille avant `cutoff`. Le scope
  // workspace sert aux vérifications ciblées, le job passe sans scope.
  purgeTrashedBefore(cutoff: Date, workspaceId?: string): Promise<TrashPurgeCounts>;
}

@Injectable()
export class PrismaTrashPurgeStore implements TrashPurgeStore {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  purgeTrashedBefore(cutoff: Date, workspaceId?: string): Promise<TrashPurgeCounts> {
    // Les tâches partent avant les projets ; la cascade du schéma couvre les
    // sous-tâches d'un parent déjà purgé.
    return this.prisma.$transaction(async (tx) => {
      const scope = workspaceId === undefined ? {} : { workspaceId };
      const tasks = await tx.task.deleteMany({
        where: { ...scope, deletedAt: { not: null, lte: cutoff } },
      });
      const projects = await tx.project.deleteMany({
        where: { ...scope, deletedAt: { not: null, lte: cutoff } },
      });
      return { tasks: tasks.count, projects: projects.count };
    });
  }
}

@Injectable()
export class TrashPurgeService {
  constructor(@Inject(TRASH_PURGE_STORE) private readonly store: TrashPurgeStore) {}

  async purgeExpired(now: Date = new Date(), workspaceId?: string): Promise<TrashPurgeCounts> {
    const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    return this.store.purgeTrashedBefore(cutoff, workspaceId);
  }
}

// RF-29 : purge automatique de la corbeille, au démarrage puis chaque jour.
@Injectable()
export class TrashPurgeWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrashPurgeWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(@Inject(TrashPurgeService) private readonly purge: TrashPurgeService) {}

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
      const counts = await this.purge.purgeExpired();
      if (counts.tasks > 0 || counts.projects > 0) {
        this.logger.log(
          `${counts.tasks} tâche(s) et ${counts.projects} projet(s) purgé(s) après 30 jours.`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Purge de la corbeille interrompue: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }
}
