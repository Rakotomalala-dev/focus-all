import { Inject, Injectable } from "@nestjs/common";
import type { TelemetryEvent } from "@focus/contracts";
import type { Prisma } from "@prisma/client";
import { uuidV7 } from "../../common/uuid-v7";
import { PrismaService } from "../../database/prisma.service";

export const TELEMETRY_REPOSITORY = "TELEMETRY_REPOSITORY";

export interface TelemetryRepository {
  isEnabled(userId: string): Promise<boolean>;
  record(event: TelemetryEvent): Promise<void>;
}

@Injectable()
export class PrismaTelemetryRepository implements TelemetryRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async isEnabled(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { telemetryEnabled: true },
    });
    return user?.telemetryEnabled === true;
  }

  // Aucun userId, workspaceId ou IP n'est écrit : l'événement reste anonyme.
  async record(event: TelemetryEvent): Promise<void> {
    await this.prisma.telemetryEvent.create({
      data: {
        id: uuidV7(),
        name: event.name,
        ...(event.properties === undefined
          ? {}
          : { properties: event.properties as Prisma.InputJsonValue }),
      },
    });
  }
}
