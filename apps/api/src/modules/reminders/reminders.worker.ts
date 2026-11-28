import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { RemindersService } from "./reminders.service";

const POLL_INTERVAL_MS = 30_000;

// Worker de livraison : interroge le journal toutes les 30 s et envoie les
// rappels échus. Le journal rend l'opération idempotente et reprenable après un
// redémarrage ; un adaptateur BullMQ pourra le remplacer sans changer le
// service (l'interface reste `dispatchDue`).
@Injectable()
export class RemindersWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemindersWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(@Inject(RemindersService) private readonly reminders: RemindersService) {}

  onModuleInit(): void {
    // Les tests pilotent `dispatchDue` explicitement : aucun timer ne doit
    // maintenir la boucle d'événements ouverte.
    if (process.env.NODE_ENV === "test") {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
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
      await this.reminders.dispatchDue();
    } catch (error) {
      this.logger.warn(`Livraison des rappels interrompue: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
