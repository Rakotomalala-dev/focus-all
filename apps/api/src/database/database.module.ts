import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

// Global : les repositories et services métier n'ont pas à réimporter le module
// pour obtenir la connexion, et il ne peut pas exister deux pools concurrents.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
