#!/usr/bin/env node
"use strict";

// Génère ` apps/api/openapi.json ` depuis les schémas Zod de @focus/contracts,
// seule source des contrats (R2/R6). Les schémas sont convertis par
// `zod-to-json-schema` ; la table des routes ci-dessous est la seule partie
// écrite à la main, parce qu'aucun schéma Zod ne porte de métadonnée HTTP.
//
// Usage :
//   node scripts/generate-openapi.cjs           # écrit openapi.json
//   node scripts/generate-openapi.cjs --check    # échoue si le fichier dérive

const fs = require("node:fs");
const path = require("node:path");
const { zodToJsonSchema } = require("zod-to-json-schema");
const contracts = require("@focus/contracts");

const OUTPUT_PATH = path.join(__dirname, "..", "openapi.json");

// Schémas exposés comme composants nommés. Toute nouvelle ressource s'ajoute
// ici, sinon elle ne sera pas publiée dans le contrat.
const COMPONENTS = {
  Task: contracts.taskSchema,
  TaskDraft: contracts.taskDraftSchema,
  TaskUpdate: contracts.taskUpdateSchema,
  TaskListResponse: contracts.taskListResponseSchema,
  ProblemDetails: contracts.problemDetailsSchema,
};

const UUID = { type: "string", format: "uuid" };
const JSON_CONTENT = "application/json";

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

const problemResponse = (description) => ({
  description,
  content: { [contracts.PROBLEM_CONTENT_TYPE]: { schema: ref("ProblemDetails") } },
});

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

// Remplace `#/definitions/X` par `#/components/schemas/X` : c'est la seule
// différence de structure entre la sortie de zod-to-json-schema et OpenAPI.
function hoistComponents() {
  const collected = {};
  for (const [name, schema] of Object.entries(COMPONENTS)) {
    const json = zodToJsonSchema(schema, { name, $refStrategy: "none" });
    const definitions = json.definitions ?? {};
    for (const [definitionName, definition] of Object.entries(definitions)) {
      collected[definitionName] = definition;
    }
    if (definitions[name] === undefined) {
      throw new Error(`zod-to-json-schema n'a pas produit le composant attendu : ${name}`);
    }
  }

  const serialized = JSON.stringify(collected).replaceAll(
    "#/definitions/",
    "#/components/schemas/",
  );
  return JSON.parse(serialized);
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
    if (typeof node.$ref === "string") {
      const prefix = "#/components/schemas/";
      const name = node.$ref.startsWith(prefix) ? node.$ref.slice(prefix.length) : undefined;
      if (name === undefined || !available.has(name)) {
        broken.push(`${location} -> ${node.$ref}`);
      }
    }
    for (const [key, value] of Object.entries(node)) {
      walk(value, `${location}.${key}`);
    }
  };

  walk(document.paths, "paths");
  walk(document.components, "components");
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
        "`412` si elle vient de `If-Match`, avec le même code `CONFLICT_VERSION`.",
    },
    paths: {
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
            404: problemResponse("Tâche introuvable dans ce workspace"),
            409: problemResponse("Version obsolète fournie dans la query"),
            412: problemResponse("Version obsolète fournie via If-Match"),
          },
        },
      },
    },
    components: { schemas: hoistComponents() },
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
