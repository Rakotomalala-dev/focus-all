-- RF-10 : unicité du nom par workspace, insensible à la casse, limitée aux
-- projets vivants. L'index d'expression n'est pas représentable dans le schéma
-- Prisma ; il est donc créé ici et protégé par la contrainte de la base.
ALTER TABLE "Project"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deletedAt" TIMESTAMPTZ(3);

CREATE INDEX "Project_workspaceId_deletedAt_idx" ON "Project" ("workspaceId", "deletedAt");

CREATE UNIQUE INDEX "Project_workspaceId_name_lower_key"
  ON "Project" ("workspaceId", lower("name"))
  WHERE "deletedAt" IS NULL;
