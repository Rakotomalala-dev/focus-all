-- RF-71 : export asynchrone. Le payload reste en JSONB jusqu'à expiration.
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED');

CREATE TABLE "ExportJob" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "error" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExportJob_userId_createdAt_idx" ON "ExportJob"("userId", "createdAt");
CREATE INDEX "ExportJob_status_createdAt_idx" ON "ExportJob"("status", "createdAt");

ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RF-72 : opt-in, désactivé par défaut pour les comptes existants.
ALTER TABLE "User" ADD COLUMN "telemetryEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Aucune colonne utilisateur : les événements sont anonymes par construction.
CREATE TABLE "TelemetryEvent" (
    "id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "properties" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemetryEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelemetryEvent_name_createdAt_idx" ON "TelemetryEvent"("name", "createdAt");
