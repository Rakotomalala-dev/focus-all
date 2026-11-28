import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ExportService } from "./export.service";

const POLL_INTERVAL_MS = 30_000;

// RF-71 : même modèle que le worker de rappels — un polling borné et
// idempotent, remplaçable par BullMQ sans changer `ExportService`.
@Injectable()
export class ExportWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExportWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(@Inject(ExportService) private readonly exports: ExportService) {}

  onModuleInit(): void {
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
      await this.exports.processPending();
    } catch (error) {
      this.logger.warn(
        `Préparation d'export interrompue: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }
}
