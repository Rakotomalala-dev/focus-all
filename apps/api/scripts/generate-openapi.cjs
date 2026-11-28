"use strict";

// Génère ` apps/api/openapi.json ` depuis les schémas Zod de @focus/contracts,
// seule source des contrats (R2/R6). Les schémas sont convertis par
// `zod-to-json-schema` ; la table des routes ci-dessous est la seule partie
// écrite à la main, parce qu'aucun schéma Zod ne porte de métadonnée HTTP.
//
// Usage :
//   node scripts/generate-openapi.cjs           # écrit openapi.json
//   node scripts/generate-openapi.cjs --check   # échoue si le fichier dérive

const fs = require("node:fs");
const path = require("node:path");
const { zodToJsonSchema } = require("zod-to-json-schema");
const contracts = require("@focus/contracts");

const OUTPUT_PATH = path.join(__dirname, "..", "openapi.json");
const REF_PREFIX = "#/components/schemas/";

// Schémas exposés comme composants nommés. Toute nouvelle ressource s'ajoute
// ici, sinon elle ne sera pas publiée dans le contrat.
const COMPONENTS = {
  Task: contracts.taskSchema,
  TaskDraft: contracts.taskDraftSchema,
  TaskUpdate: contracts.taskUpdateSchema,
  TaskListResponse: contracts.taskListResponseSchema,
  TaskOrder: contracts.taskOrderSchema,
  ViewCard: contracts.viewCardSchema,
  TodaySection: contracts.todaySectionSchema,
  TodayView: contracts.todayViewSchema,
  UpcomingDay: contracts.upcomingDaySchema,
  UpcomingView: contracts.upcomingViewSchema,
  CalendarDay: contracts.calendarDaySchema,
  CalendarView: contracts.calendarViewSchema,
  KanbanColumn: contracts.kanbanColumnSchema,
  KanbanView: contracts.kanbanViewSchema,
  KanbanMove: contracts.kanbanMoveSchema,
  ProjectOrder: contracts.projectOrderSchema,
  InboxEmpty: contracts.inboxEmptySchema,
  TrashResponse: contracts.trashResponseSchema,
  Project: contracts.projectSchema,
  ProjectDraft: contracts.projectDraftSchema,
  ProjectUpdate: contracts.projectUpdateSchema,
  ProjectListResponse: contracts.projectListResponseSchema,
  Tag: contracts.tagSchema,
  TagDraft: contracts.tagDraftSchema,
  TagUpdate: contracts.tagUpdateSchema,
  TagListResponse: contracts.tagListResponseSchema,
  ProblemDetails: contracts.problemDetailsSchema,
  AuthTokens: contracts.authTokensSchema,
  RegisterInput: contracts.registerInputSchema,
  LoginInput: contracts.loginInputSchema,
  RefreshInput: contracts.refreshInputSchema,
  MeResponse: contracts.meResponseSchema,
  ProfileUpdate: contracts.profileUpdateSchema,
  PasswordChange: contracts.passwordChangeSchema,
  PasswordResetRequest: contracts.passwordResetRequestSchema,
  PasswordResetConfirm: contracts.passwordResetConfirmSchema,
  DeleteAccount: contracts.deleteAccountSchema,
  Session: contracts.sessionSchema,
  SessionListResponse: contracts.sessionListResponseSchema,
  Connection: contracts.connectionSchema,
  ConnectionListResponse: contracts.connectionListResponseSchema,
  AccountExport: contracts.accountExportSchema,
  SyncMutation: contracts.syncMutationSchema,
  SyncPushRequest: contracts.syncPushRequestSchema,
  SyncPushResponse: contracts.syncPushResponseSchema,
  SyncChange: contracts.syncChangeSchema,
  SyncPullResponse: contracts.syncPullResponseSchema,
  SyncSnapshotResponse: contracts.syncSnapshotResponseSchema,
};

const UUID = { type: "string", format: "uuid" };
const JSON_CONTENT = "application/json";

const ref = (name) => ({ $ref: `${REF_PREFIX}${name}` });

const problemResponse = (description) => ({
  description,
  content: { [contracts.PROBLEM_CONTENT_TYPE]: { schema: ref("ProblemDetails") } },
});

// Authentification unique de l'API (ADR-010) : jeton d'accès JWT. Le refresh
// token est opaque, échangé uniquement sur `/auth/refresh` et `/auth/logout`.
const BEARER_AUTH = {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description:
    "Jeton d'accès JWT (`Authorization: Bearer …`). `workspaceId` et `userId` viennent de ses claims, " +
    "jamais du corps ni de la query. Absent ou invalide → `401 UNAUTHENTICATED` ; expiré → `401 SESSION_EXPIRED`.",
};

const UNAUTHORIZED = problemResponse("Jeton absent, invalide ou expiré");

const etagHeader = {
  description: "Version courante ; à renvoyer tel quel dans `If-Match`.",
  schema: { type: "string", example: '"3"' },
};

const ID_PARAMETER = {
  name: "id",
  in: "path",
  required: true,
  schema: UUID,
};

const IF_MATCH_PARAMETER = {
  name: "If-Match",
  in: "header",
  required: false,
  description:
    'Version attendue (`3`, `"3"` ou `W/"3"`). Obsolète → `412` ; absente et sans `version` dans le corps → `400`.',
  schema: { type: "string", example: '"3"' },
};

const taskResponse = (description) => ({
  description,
  headers: { ETag: etagHeader },
  content: { [JSON_CONTENT]: { schema: ref("Task") } },
});

// `$refStrategy: "none"` inline les schémas réutilisés : chaque composant
// publié est autonome, sans `$ref` vers un sous-chemin d'un autre composant,
// et il n'y a donc aucun `#/definitions/*` à réécrire.
function collectSchemas() {
  const schemas = {};
  for (const [name, schema] of Object.entries(COMPONENTS)) {
    const { definitions = {} } = zodToJsonSchema(schema, { name, $refStrategy: "none" });
    Object.assign(schemas, definitions);
  }
  return schemas;
}

// Un `$ref` cassé produirait un document invalide que seule une validation
// externe attraperait : on vérifie ici que chaque référence pointe sur un
// composant réellement émis.
function assertReferencesResolve(document) {
  const available = new Set(Object.keys(document.components.schemas));
  const broken = [];
  const walk = (node, location) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${location}[${index}]`));
      return;
    }
    if (typeof node !== "object" || node === null) {
      return;
    }
    if (typeof node.$ref === "string" && !available.has(node.$ref.replace(REF_PREFIX, ""))) {
      broken.push(`${location} -> ${node.$ref}`);
    }
    for (const [key, value] of Object.entries(node)) {
      walk(value, `${location}.${key}`);
    }
  };

  walk(document, "document");
  if (broken.length > 0) {
    throw new Error(`Références introuvables dans le document :\n  ${broken.join("\n  ")}`);
  }
}

function buildDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Focus API",
      version: "1.0.0",
      description:
        "Contrat REST de Focus. Généré depuis `@focus/contracts` par `pnpm api:openapi` — " +
        "ne pas éditer à la main. Erreurs au format RFC 9457 (`application/problem+json`). " +
        "Concurrence optimiste : la version attendue vient du corps (`version`) ou de " +
        "`If-Match` ; une version obsolète donne `409` si elle vient du corps ou de la query, " +
        "`412` si elle vient de `If-Match`, avec le même code `CONFLICT_VERSION`. " +
        "Toutes les routes exigent un jeton d'accès JWT, sauf les sondes `/health`.",
    },
    // S'applique à toutes les opérations ; les sondes de santé ne font pas
    // partie de ce document (elles ne sont pas préfixées `/api/v1`).
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/v1/auth/register": {
        post: {
          summary: "Inscrire un compte et créer son workspace personnel",
          security: [],
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("RegisterInput") } },
          },
          responses: {
            201: {
              description: "Compte créé, jetons d'accès et de rafraîchissement",
              content: { [JSON_CONTENT]: { schema: ref("AuthTokens") } },
            },
            400: problemResponse("Corps invalide"),
            409: problemResponse("E-mail déjà utilisé"),
          },
        },
      },
      "/api/v1/auth/login": {
        post: {
          summary: "Se connecter par e-mail et mot de passe",
          security: [],
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("LoginInput") } },
          },
          responses: {
            200: {
              description: "Jetons émis",
              content: { [JSON_CONTENT]: { schema: ref("AuthTokens") } },
            },
            400: problemResponse("Corps invalide"),
            401: problemResponse("Identifiants invalides"),
            429: problemResponse("Trop d'échecs : verrouillage progressif (1, 5 ou 15 minutes)"),
          },
        },
      },
      "/api/v1/auth/password-reset/request": {
        post: {
          summary: "Demander un lien de réinitialisation (réponse toujours 202)",
          security: [],
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("PasswordResetRequest") } },
          },
          responses: {
            202: { description: "Demande acceptée, sans révéler l'existence du compte" },
            400: problemResponse("Corps invalide"),
          },
        },
      },
      "/api/v1/auth/password-reset/confirm": {
        post: {
          summary: "Consommer un jeton de réinitialisation et révoquer les sessions",
          security: [],
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("PasswordResetConfirm") } },
          },
          responses: {
            204: { description: "Mot de passe changé, sessions révoquées" },
            400: problemResponse("Jeton inconnu, expiré ou déjà consommé"),
          },
        },
      },
      "/api/v1/auth/password/change": {
        post: {
          summary: "Changer le mot de passe et révoquer les autres sessions",
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("PasswordChange") } },
          },
          responses: {
            204: { description: "Mot de passe changé" },
            400: problemResponse("Mot de passe actuel incorrect ou nouveau mot de passe invalide"),
            401: UNAUTHORIZED,
          },
        },
      },
      "/api/v1/auth/sessions": {
        get: {
          summary: "Lister les sessions actives",
          responses: {
            200: {
              description: "Sessions actives de l'utilisateur, session courante marquée",
              content: { [JSON_CONTENT]: { schema: ref("SessionListResponse") } },
            },
            401: UNAUTHORIZED,
          },
        },
        delete: {
          summary: "Révoquer toutes les sessions, y compris la session courante",
          responses: {
            204: { description: "Toutes les sessions révoquées" },
            401: UNAUTHORIZED,
          },
        },
      },
      "/api/v1/auth/sessions/{id}": {
        delete: {
          summary: "Révoquer une session",
          parameters: [ID_PARAMETER],
          responses: {
            204: { description: "Session révoquée" },
            401: UNAUTHORIZED,
            404: problemResponse("Session absente ou appartenant à un autre compte"),
          },
        },
      },
      "/api/v1/auth/connections": {
        get: {
          summary: "Consulter les dernières connexions (une entrée par famille)",
          responses: {
            200: {
              description: "Historique des connexions",
              content: { [JSON_CONTENT]: { schema: ref("ConnectionListResponse") } },
            },
            401: UNAUTHORIZED,
          },
        },
      },
      "/api/v1/auth/refresh": {
        post: {
          summary: "Faire tourner le refresh token",
          security: [],
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("RefreshInput") } },
          },
          responses: {
            200: {
              description: "Nouveaux jetons ; l'ancien refresh token est révoqué",
              content: { [JSON_CONTENT]: { schema: ref("AuthTokens") } },
            },
            400: problemResponse("Corps invalide"),
            401: problemResponse("Refresh token inconnu, expiré ou déjà consommé"),
          },
        },
      },
      "/api/v1/auth/logout": {
        post: {
          summary: "Révoquer la session courante",
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("RefreshInput") } },
          },
          responses: {
            204: { description: "Session révoquée, sans corps" },
            400: problemResponse("Corps invalide"),
            401: UNAUTHORIZED,
          },
        },
      },
      "/api/v1/me": {
        get: {
          summary: "Profil, préférences et workspaces de l'utilisateur courant",
          responses: {
            200: {
              description: "Profil courant",
              content: { [JSON_CONTENT]: { schema: ref("MeResponse") } },
            },
            401: UNAUTHORIZED,
          },
        },
        patch: {
          summary: "Mettre à jour le profil et les préférences",
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("ProfileUpdate") } },
          },
          responses: {
            200: {
              description: "Profil mis à jour",
              content: { [JSON_CONTENT]: { schema: ref("MeResponse") } },
            },
            400: problemResponse("Champ invalide ou corps vide"),
            401: UNAUTHORIZED,
          },
        },
        delete: {
          summary: "Supprimer logiquement le compte (purge après 30 jours)",
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("DeleteAccount") } },
          },
          responses: {
            204: { description: "Compte désactivé, sessions révoquées" },
            400: problemResponse("Confirmation ou mot de passe invalide"),
            401: UNAUTHORIZED,
          },
        },
      },
      "/api/v1/me/export": {
        get: {
          summary: "Exporter les données du compte avant suppression",
          responses: {
            200: {
              description: "Export JSON synchrone",
              content: { [JSON_CONTENT]: { schema: ref("AccountExport") } },
            },
            401: UNAUTHORIZED,
          },
        },
      },
      "/api/v1/sync/pull": {
        get: {
          summary: "Tirer les changements depuis un curseur",
          parameters: [
            {
              name: "since",
              in: "query",
              description: "Curseur du journal (0 = depuis le début).",
              schema: { type: "integer", minimum: 0, default: 0 },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 500, default: 500 },
            },
          ],
          responses: {
            200: {
              description: "Changements ordonnés par curseur croissant",
              content: { [JSON_CONTENT]: { schema: ref("SyncPullResponse") } },
            },
            400: problemResponse("Curseur ou limite invalide"),
            401: UNAUTHORIZED,
          },
        },
      },
      "/api/v1/sync/push": {
        post: {
          summary: "Pousser un lot de mutations hors ligne",
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("SyncPushRequest") } },
          },
          responses: {
            200: {
              description: "Un résultat par mutation (`applied`, `conflict`, `rejected`)",
              content: { [JSON_CONTENT]: { schema: ref("SyncPushResponse") } },
            },
            400: problemResponse("Lot invalide"),
            401: UNAUTHORIZED,
          },
        },
      },
      "/api/v1/sync/snapshot": {
        get: {
          summary: "Instantané complet du workspace",
          responses: {
            200: {
              description: "Tâches non supprimées et curseur courant",
              content: { [JSON_CONTENT]: { schema: ref("SyncSnapshotResponse") } },
            },
            401: UNAUTHORIZED,
          },
        },
      },
      "/api/v1/tasks": {
        get: {
          summary: "Lister les tâches du workspace courant",
          parameters: [
            {
              name: "cursor",
              in: "query",
              description: "Curseur opaque renvoyé par la page précédente.",
              schema: { type: "string" },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
            {
              name: "status",
              in: "query",
              schema: { type: "string", enum: [...contracts.TASK_STATUSES] },
            },
            { name: "projectId", in: "query", schema: UUID },
            {
              name: "priority",
              in: "query",
              schema: { type: "string", enum: [...contracts.TASK_PRIORITIES] },
            },
            { name: "sort", in: "query", schema: { type: "string", enum: [...contracts.TASK_SORTS] } },
            {
              name: "due",
              in: "query",
              schema: { type: "string", enum: [...contracts.DUE_FILTERS] },
            },
            { name: "tagIds", in: "query", description: "UUID séparés par des virgules (ET).", schema: { type: "string" } },
            { name: "q", in: "query", description: "Recherche plein texte sans accents.", schema: { type: "string" } },
            { name: "parentId", in: "query", schema: UUID },
            { name: "inbox", in: "query", schema: { type: "boolean" } },
            { name: "includeCompleted", in: "query", schema: { type: "boolean" } },
          ],
          responses: {
            200: {
              description: "Page de tâches, triée par `sortOrder` puis `id`.",
              content: { [JSON_CONTENT]: { schema: ref("TaskListResponse") } },
            },
            400: problemResponse("Paramètres invalides"),
            401: UNAUTHORIZED,
          },
        },
        post: {
          summary: "Créer une tâche",
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("TaskDraft") } },
          },
          responses: {
            201: {
              description: "Tâche créée",
              headers: {
                Location: { description: "URL de la tâche créée", schema: { type: "string" } },
                ETag: etagHeader,
              },
              content: { [JSON_CONTENT]: { schema: ref("Task") } },
            },
            400: problemResponse("Corps invalide"),
            401: UNAUTHORIZED,
          },
        },
      },
      "/api/v1/views/today": {
        get: {
          summary: "Agrégat Aujourd'hui : retards, jour, en cours, épinglées, accomplies",
          parameters: [
            {
              name: "date",
              in: "query",
              description: "Jour de référence (défaut : jour courant UTC).",
              schema: { type: "string", format: "date" },
            },
          ],
          responses: {
            200: {
              description:
                "Sections non vides, dans l'ordre En retard, Aujourd'hui, En cours, Épinglées, Accomplies ; « Accomplies » repliée par défaut.",
              content: { [JSON_CONTENT]: { schema: ref("TodayView") } },
            },
            400: problemResponse("Date invalide"),
            401: UNAUTHORIZED,
          },
        },
      },
      "/api/v1/views/upcoming": {
        get: {
          summary: "Agrégat Prochain : sept jours glissants avec charge et surcharge",
          parameters: [
            {
              name: "date",
              in: "query",
              description: "Premier jour de la fenêtre (défaut : jour courant UTC).",
              schema: { type: "string", format: "date" },
            },
          ],
          responses: {
            200: {
              description:
                "Sept jours, chacun avec son nombre de tâches, son estimation totale et `overloaded` (> 8 h ou > 12 tâches).",
              content: { [JSON_CONTENT]: { schema: ref("UpcomingView") } },
            },
            400: problemResponse("Date invalide"),
            401: UNAUTHORIZED,
          },
        },
      },
      "/api/v1/views/calendar": {
        get: {
          summary: "Calendrier mensuel ou hebdomadaire, occurrences récurrentes incluses",
          parameters: [
            {
              name: "mode",
              in: "query",
              schema: { type: "string", enum: [...contracts.CALENDAR_MODES], default: "MONTH" },
            },
            {
              name: "anchor",
              in: "query",
              description: "N'importe quelle date du mois ou de la semaine affichée.",
              schema: { type: "string", format: "date" },
            },
          ],
          responses: {
            200: {
              description:
                "Jours de la période ; les occurrences récurrentes futures sont calculées et jamais persistées.",
              content: { [JSON_CONTENT]: { schema: ref("CalendarView") } },
            },
            400: problemResponse("Mode ou date invalide"),
            401: UNAUTHORIZED,
          },
        },
      },
      "/api/v1/views/kanban": {
        get: {
          summary: "Tableau Kanban d'un projet (TODO, IN_PROGRESS, DONE)",
          parameters: [
            { name: "projectId", in: "query", required: true, schema: UUID },
          ],
          responses: {
            200: {
              description: "Trois colonnes ordonnées par position de carte",
              content: { [JSON_CONTENT]: { schema: ref("KanbanView") } },
            },
            400: problemResponse("Projet absent ou invalide"),
            401: UNAUTHORIZED,
            404: problemResponse("Projet introuvable dans ce workspace"),
          },
        },
      },
      "/api/v1/views/kanban/move": {
        post: {
          summary: "Déplacer une carte : statut et position dans la colonne",
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("KanbanMove") } },
          },
          responses: {
            200: {
              description: "Tâche mise à jour ; `completedAt` renseigné à l'arrivée en DONE",
              content: { [JSON_CONTENT]: { schema: ref("Task") } },
            },
            400: problemResponse("Corps invalide ou voisin incohérent"),
            401: UNAUTHORIZED,
            404: problemResponse("Projet ou tâche introuvable dans ce workspace"),
            409: problemResponse("Version obsolète"),
          },
        },
      },
      "/api/v1/tasks/order": {
        patch: {
          summary: "Réordonner les tâches (ordre fractionnaire persistant)",
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("TaskOrder") } },
          },
          responses: {
            200: {
              description: "Tâches dans leur nouvel ordre",
              content: {
                [JSON_CONTENT]: { schema: { type: "array", items: ref("Task") } },
              },
            },
            400: problemResponse("Identifiants invalides ou tâches hors workspace"),
            401: UNAUTHORIZED,
          },
        },
      },
      "/api/v1/tasks/inbox/empty": {
        post: {
          summary: "Vider l'Inbox vers un projet",
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("InboxEmpty") } },
          },
          responses: {
            200: {
              description: "Nombre de tâches déplacées",
              content: {
                [JSON_CONTENT]: {
                  schema: {
                    type: "object",
                    required: ["moved"],
                    properties: { moved: { type: "integer", minimum: 0 } },
                  },
                },
              },
            },
            400: problemResponse("Projet invalide"),
            401: UNAUTHORIZED,
            409: problemResponse("Projet archivé"),
          },
        },
      },
      "/api/v1/tasks/trash": {
        get: {
          summary: "Lister la corbeille (tâches et projets, 30 jours)",
          responses: {
            200: {
              description: "Éléments supprimés et restaurables",
              content: { [JSON_CONTENT]: { schema: ref("TrashResponse") } },
            },
            401: UNAUTHORIZED,
          },
        },
      },
      "/api/v1/tasks/{id}": {
        get: {
          summary: "Lire une tâche",
          parameters: [ID_PARAMETER],
          responses: {
            200: taskResponse("Tâche demandée"),
            400: problemResponse("Identifiant qui n'est pas un UUID"),
            401: UNAUTHORIZED,
            404: problemResponse("Tâche introuvable dans ce workspace"),
          },
        },
        patch: {
          summary: "Modifier partiellement une tâche",
          parameters: [ID_PARAMETER, IF_MATCH_PARAMETER],
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("TaskUpdate") } },
          },
          responses: {
            200: taskResponse("Tâche mise à jour, `version` incrémentée"),
            400: problemResponse("Corps invalide ou version attendue absente"),
            401: UNAUTHORIZED,
            404: problemResponse("Tâche introuvable dans ce workspace"),
            409: problemResponse("Version obsolète fournie dans le corps ou la query"),
            412: problemResponse("Version obsolète fournie via If-Match"),
          },
        },
        delete: {
          summary: "Supprimer une tâche",
          parameters: [ID_PARAMETER, IF_MATCH_PARAMETER],
          responses: {
            204: { description: "Tâche supprimée, sans corps" },
            400: problemResponse("Identifiant invalide ou version attendue absente"),
            401: UNAUTHORIZED,
            404: problemResponse("Tâche introuvable dans ce workspace"),
            409: problemResponse("Version obsolète fournie dans la query"),
            412: problemResponse("Version obsolète fournie via If-Match"),
          },
        },
      },
      "/api/v1/tasks/{id}/restore": {
        post: {
          summary: "Restaurer une tâche depuis la corbeille",
          parameters: [ID_PARAMETER],
          responses: {
            200: taskResponse("Tâche restaurée avec ses sous-tâches"),
            400: problemResponse("Identifiant invalide"),
            401: UNAUTHORIZED,
            404: problemResponse("Tâche introuvable dans la corbeille"),
          },
        },
      },
      "/api/v1/projects": {
        get: {
          summary: "Lister les projets du workspace courant",
          responses: {
            200: {
              description: "Projets triés par ordre manuel",
              content: { [JSON_CONTENT]: { schema: ref("ProjectListResponse") } },
            },
            401: UNAUTHORIZED,
          },
        },
        post: {
          summary: "Créer un projet",
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("ProjectDraft") } },
          },
          responses: {
            201: {
              description: "Projet créé",
              headers: {
                Location: { description: "URL du projet créé", schema: { type: "string" } },
                ETag: etagHeader,
              },
              content: { [JSON_CONTENT]: { schema: ref("Project") } },
            },
            400: problemResponse("Corps invalide"),
            401: UNAUTHORIZED,
            409: problemResponse("Limite de projets atteinte"),
          },
        },
      },
      "/api/v1/projects/order": {
        patch: {
          summary: "Réordonner les projets",
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("ProjectOrder") } },
          },
          responses: {
            200: {
              description: "Projets dans leur nouvel ordre",
              content: {
                [JSON_CONTENT]: { schema: { type: "array", items: ref("Project") } },
              },
            },
            400: problemResponse("Identifiants invalides ou projets hors workspace"),
            401: UNAUTHORIZED,
          },
        },
      },
      "/api/v1/projects/{id}": {
        get: {
          summary: "Lire un projet",
          parameters: [ID_PARAMETER],
          responses: {
            200: {
              description: "Projet demandé",
              headers: { ETag: etagHeader },
              content: { [JSON_CONTENT]: { schema: ref("Project") } },
            },
            401: UNAUTHORIZED,
            404: problemResponse("Projet introuvable dans ce workspace"),
          },
        },
        patch: {
          summary: "Modifier, archiver ou désarchiver un projet",
          parameters: [ID_PARAMETER, IF_MATCH_PARAMETER],
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("ProjectUpdate") } },
          },
          responses: {
            200: {
              description: "Projet mis à jour, `version` incrémentée",
              headers: { ETag: etagHeader },
              content: { [JSON_CONTENT]: { schema: ref("Project") } },
            },
            400: problemResponse("Corps invalide ou version absente"),
            401: UNAUTHORIZED,
            404: problemResponse("Projet introuvable"),
            409: problemResponse("Version obsolète"),
            412: problemResponse("Version obsolète via If-Match"),
          },
        },
        delete: {
          summary: "Supprimer un projet et ses tâches (corbeille)",
          parameters: [ID_PARAMETER, IF_MATCH_PARAMETER],
          responses: {
            204: { description: "Projet supprimé, sans corps" },
            400: problemResponse("Identifiant ou version attendue invalide"),
            401: UNAUTHORIZED,
            404: problemResponse("Projet introuvable"),
            409: problemResponse("Version obsolète"),
            412: problemResponse("Version obsolète via If-Match"),
          },
        },
      },
      "/api/v1/projects/{id}/restore": {
        post: {
          summary: "Restaurer un projet depuis la corbeille",
          parameters: [ID_PARAMETER],
          responses: {
            200: {
              description: "Projet restauré avec ses tâches",
              headers: { ETag: etagHeader },
              content: { [JSON_CONTENT]: { schema: ref("Project") } },
            },
            400: problemResponse("Identifiant invalide"),
            401: UNAUTHORIZED,
            404: problemResponse("Projet introuvable dans la corbeille"),
          },
        },
      },
      "/api/v1/tags": {
        get: {
          summary: "Lister les tags du workspace",
          responses: {
            200: {
              description: "Tags triés par nom normalisé",
              content: { [JSON_CONTENT]: { schema: ref("TagListResponse") } },
            },
            401: UNAUTHORIZED,
          },
        },
        post: {
          summary: "Créer un tag",
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("TagDraft") } },
          },
          responses: {
            201: {
              description: "Tag créé",
              content: { [JSON_CONTENT]: { schema: ref("Tag") } },
            },
            400: problemResponse("Corps invalide"),
            401: UNAUTHORIZED,
            409: problemResponse("Nom déjà utilisé ou limite atteinte"),
          },
        },
      },
      "/api/v1/tags/ensure": {
        post: {
          summary: "Créer les tags manquants et renvoyer les existants (saisie rapide)",
          requestBody: {
            required: true,
            content: {
              [JSON_CONTENT]: {
                schema: {
                  type: "object",
                  required: ["names"],
                  properties: {
                    names: { type: "array", minItems: 1, maxItems: 20, items: { type: "string", minLength: 1, maxLength: 40 } },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Tags résolus",
              content: {
                [JSON_CONTENT]: { schema: { type: "array", items: ref("Tag") } },
              },
            },
            400: problemResponse("Corps invalide"),
            401: UNAUTHORIZED,
            409: problemResponse("Limite de tags atteinte"),
          },
        },
      },
      "/api/v1/tags/{id}": {
        patch: {
          summary: "Renommer ou recolorer un tag",
          parameters: [ID_PARAMETER],
          requestBody: {
            required: true,
            content: { [JSON_CONTENT]: { schema: ref("TagUpdate") } },
          },
          responses: {
            200: {
              description: "Tag mis à jour",
              content: { [JSON_CONTENT]: { schema: ref("Tag") } },
            },
            400: problemResponse("Corps invalide"),
            401: UNAUTHORIZED,
            404: problemResponse("Tag introuvable"),
            409: problemResponse("Nom déjà utilisé"),
          },
        },
        delete: {
          summary: "Supprimer un tag et retirer ses références des tâches",
          parameters: [ID_PARAMETER],
          responses: {
            204: { description: "Tag supprimé, sans corps" },
            401: UNAUTHORIZED,
            404: problemResponse("Tag introuvable"),
          },
        },
      },
    },
    components: {
      schemas: collectSchemas(),
      securitySchemes: { bearerAuth: BEARER_AUTH },
    },
  };
}

function firstDifference(expected, actual) {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const length = Math.max(expectedLines.length, actualLines.length);
  for (let index = 0; index < length; index += 1) {
    if (expectedLines[index] !== actualLines[index]) {
      return {
        line: index + 1,
        expected: expectedLines[index] ?? "<absente>",
        actual: actualLines[index] ?? "<absente>",
      };
    }
  }
  return undefined;
}

function main(argv) {
  const check = argv.includes("--check");
  const document = buildDocument();
  assertReferencesResolve(document);
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  const existing = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, "utf8") : undefined;

  if (!check) {
    fs.writeFileSync(OUTPUT_PATH, serialized, "utf8");
    // `console.log` est interdit par le preset : la sortie attendue d'un
    // générateur est un artefact, pas un journal applicatif.
    process.stdout.write(`openapi.json écrit (${serialized.length} caractères).\n`);
    return 0;
  }

  if (existing === serialized) {
    process.stdout.write("openapi.json est à jour.\n");
    return 0;
  }

  console.error("openapi.json est désynchronisé des schémas de @focus/contracts.");
  if (existing === undefined) {
    console.error(
      "Le fichier est absent : lancez `pnpm api:openapi` puis committez apps/api/openapi.json.",
    );
    return 1;
  }
  const difference = firstDifference(serialized, existing);
  if (difference !== undefined) {
    console.error(`Première différence ligne ${difference.line} :`);
    console.error(`  attendu : ${difference.expected}`);
    console.error(`  fichier : ${difference.actual}`);
  }
  console.error("Lancez `pnpm api:openapi` puis committez le résultat.");
  return 1;
}

process.exitCode = main(process.argv.slice(2));
