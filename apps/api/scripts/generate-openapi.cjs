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
