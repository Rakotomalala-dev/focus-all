-- RF-20 : l'analyse de la saisie rapide peut être désactivée.
ALTER TABLE "User" ADD COLUMN "quickAddParsingEnabled" BOOLEAN NOT NULL DEFAULT true;

-- RF-21/RF-25 : date de début, heure d'échéance déjà présente, rappels multiples.
ALTER TABLE "Task" ADD COLUMN "startDate" DATE;
ALTER TABLE "Task" ADD COLUMN "reminders" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- RF-26 : tags par workspace, unicité insensible à la casse.
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "nameNormalized" VARCHAR(40) NOT NULL,
    "color" VARCHAR(32),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tag_workspaceId_nameNormalized_key"
    ON "Tag"("workspaceId", "nameNormalized");
CREATE INDEX "Tag_workspaceId_idx" ON "Tag"("workspaceId");

ALTER TABLE "Tag" ADD CONSTRAINT "Tag_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- RF-27 : recherche plein texte insensible aux accents. La fonction est
-- immuable, condition pour indexer une colonne générée.
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION focus_unaccent(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT public.unaccent('public.unaccent', value) $$;

ALTER TABLE "Task"
    ADD COLUMN "searchVector" tsvector
    GENERATED ALWAYS AS (
        to_tsvector(
            'simple',
            focus_unaccent(coalesce("title", '') || ' ' || coalesce("description", ''))
        )
    ) STORED;

CREATE INDEX "Task_searchVector_idx" ON "Task" USING GIN ("searchVector");

-- RF-12/RF-29 : parcours des listes réordonnées et de la corbeille.
CREATE INDEX "Task_workspaceId_deletedAt_sortOrder_idx"
    ON "Task"("workspaceId", "deletedAt", "sortOrder");
CREATE INDEX "Project_workspaceId_deletedAt_sortOrder_idx"
    ON "Project"("workspaceId", "deletedAt", "sortOrder");
