-- RF-31 : épinglage d'une tâche, indépendant de son échéance. Une tâche
-- épinglée apparaît dans la vue Aujourd'hui même sans date.
ALTER TABLE "Task" ADD COLUMN "pinnedAt" TIMESTAMPTZ(3);

-- RF-34 : position d'une carte dans la colonne Kanban de son projet. Cette
-- clé est distincte de `sortOrder`, qui reste l'ordre manuel global de la
-- liste : déplacer une carte ne réordonne donc pas les autres vues.
ALTER TABLE "Task" ADD COLUMN "boardOrder" DECIMAL(30, 15);

CREATE INDEX "Task_workspaceId_projectId_status_boardOrder_idx"
    ON "Task"("workspaceId", "projectId", "status", "boardOrder");
