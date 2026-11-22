# 03 — Documentation technique

> **Projet :** Focus
> **Statut :** v1.0 — procédures de référence pour installer, configurer, tester et déployer
> **Public :** développeurs, DevOps, QA, agents IA contributeurs
> **Documents liés :** [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) · [02-CAHIER-DES-CHARGES.md](./02-CAHIER-DES-CHARGES.md) · [04-BEST-PRACTICES.md](./04-BEST-PRACTICES.md) · [05-SKILLS-AND-TOOLS.md](./05-SKILLS-AND-TOOLS.md)

> **Avertissement d'état.** À la date de rédaction, le dépôt ne contient **aucun code applicatif** : uniquement `.gitignore` et ce dossier `docs/`. Tout ce qui suit décrit la procédure **cible** à mettre en place lors de la phase M0. Aucune commande ci-dessous n'a encore été exécutée avec succès sur ce dépôt ; elles sont spécifiées pour être implémentées puis validées.

---

## 1. Prérequis

### 1.1 Outils obligatoires

| Outil | Version cible | Rôle | Vérification |
|---|---|---|---|
| Node.js | **22 LTS** (`>=22.12 <23`) | runtime API, tooling | `node -v` |
| pnpm | **9.x** | gestionnaire de paquets du monorepo | `pnpm -v` |
| Docker + Docker Compose | 24+ | Postgres, Redis, MinIO, MailHog locaux | `docker compose version` |
| Git | 2.40+ | versionnement | `git --version` |
| Android Studio + SDK 34+ | dernière stable | émulateur et builds Android locaux | `adb version` |
| JDK | 17 | builds Android (Gradle) | `java -version` |
| Rust + toolchain Tauri | stable | app desktop (V1.1 uniquement) | `rustc --version` |

### 1.2 Outils recommandés

| Outil | Rôle |
|---|---|
| VS Code + extensions (ESLint, Prettier, Prisma, Tailwind, Error Lens) | édition |
| TablePlus / DBeaver | inspection PostgreSQL |
| RedisInsight | inspection Redis |
| Expo Go (Android) | test rapide sans build natif |
| Maestro CLI | tests E2E mobile |
| k6 | tests de charge |

### 1.3 Écart constaté sur le poste de développement

```text
Constaté : Node v25.8.1, npm 11.11.0, pnpm absent, Bun absent.
Requis   : Node 22 LTS, pnpm 9.
```

Node 25 n'est pas une version LTS et n'est pas supporté par les versions stables d'Expo/Nest au moment de la rédaction (doc 01, ADR-016). Procédure de réalignement :

```bash
# Option A — nvm (macOS/Linux/WSL)
nvm install 22
nvm use 22

# Option B — nvm-windows
nvm install 22.12.0
nvm use 22.12.0

# Activation de pnpm via Corepack (fourni avec Node)
corepack enable
corepack prepare pnpm@9 --activate
pnpm -v   # doit afficher 9.x
```

Le fichier `.nvmrc` (`22`) et `engines` dans `package.json` verrouillent la contrainte ; `pnpm install` échoue volontairement si la version ne correspond pas (via `engine-strict=true` dans `.npmrc`).

---

## 2. Installation

### 2.1 Clonage et dépendances

```bash
git clone <url-du-depot> focus-all
cd focus-all
pnpm install
```

`pnpm install` exécute les `postinstall` utiles (génération du client Prisma). Sur Windows, si les scripts sont bloqués, utiliser `pnpm install --config.enable-pre-post-scripts=true` — mais la configuration recommandée est `pnpm-workspace.yaml` + scripts explicites, sans dépendre des postinstall.

### 2.2 Services locaux

```bash
cp .env.example .env          # puis ajuster si nécessaire
pnpm docker:up                # Postgres + Redis + MinIO + MailHog
```

`docker/compose.yml` (à créer en M0) déclare :

| Service | Image | Ports | Volume |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | 5432 | `pgdata` |
| `redis` | `redis:7-alpine` (`--appendonly yes`) | 6379 | `redisdata` |
| `minio` | `minio/minio` | 9000, 9001 | `miniodata` |
| `mailhog` | `mailhog/mailhog` | 1025 (SMTP), 8025 (UI) | — |

Vérification :

```bash
docker compose -f docker/compose.yml ps
# postgres, redis, minio, mailhog doivent être "running (healthy)"
```

### 2.3 Base de données

```bash
pnpm db:migrate      # applique les migrations Prisma
pnpm db:seed         # jeu de données de développement
```

Le seed crée :

| Compte | Mot de passe | Contenu |
|---|---|---|
| `demo@focus.local` | `Demo1234!` | 3 projets, 42 tâches, 8 tags, 5 tâches récurrentes, rappels |
| `empty@focus.local` | `Demo1234!` | workspace vide (test des états vides) |

> Ces identifiants sont **strictement locaux**. Le seed refuse de s'exécuter si `NODE_ENV=production`.

### 2.4 Démarrage

```bash
pnpm dev          # API (4000) + Expo (8081) en parallèle via Turborepo
```

| URL | Contenu |
|---|---|
| `http://localhost:4000/api/v1` | API |
| `http://localhost:4000/docs` | Swagger UI (dev uniquement) |
| `http://localhost:4000/health` | liveness |
| `http://localhost:4000/health/ready` | readiness (DB + Redis) |
| `http://localhost:8081` | Expo : web + bundler mobile |
| `http://localhost:8081/--/` | outil de développement Expo |

Dans Expo, `a` ouvre l'émulateur Android, `w` ouvre le web. Le client doit pointer sur l'API via `EXPO_PUBLIC_API_URL` ; sur émulateur Android, `localhost` désigne l'émulateur lui-même → utiliser `http://10.0.2.2:4000` (documenté dans `.env.example`).

### 2.5 Vérification de l'installation

```bash
pnpm typecheck && pnpm lint && pnpm test
curl -s http://localhost:4000/health/ready | jq
```

Attendu : `{"status":"ok","checks":{"database":"up","redis":"up"}}`.

---

## 3. Structure du monorepo et commandes

### 3.1 Espaces de travail

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

### 3.2 Scripts

| Commande | Portée | Description |
|---|---|---|
| `pnpm dev` | racine | `turbo run dev --parallel` |
| `pnpm dev:api` | `apps/api` | `nest start --watch` |
| `pnpm dev:app` | `apps/mobile` | `expo start` |
| `pnpm build` | racine | build de tous les paquets puis apps |
| `pnpm build:api` | `apps/api` | `nest build` → `dist/` |
| `pnpm build:web` | `apps/mobile` | `expo export --platform web` → `apps/mobile/dist/` |
| `pnpm lint` | racine | ESLint sur tout le dépôt |
| `pnpm lint:fix` | racine | corrections automatiques |
| `pnpm format` | racine | Prettier `--write` |
| `pnpm typecheck` | racine | `tsc --noEmit` par paquet |
| `pnpm test` | racine | tests unitaires (Vitest) |
| `pnpm test:watch` | paquet | mode watch |
| `pnpm test:integration` | `apps/api` | tests avec Postgres éphémère |
| `pnpm test:e2e:web` | racine | Playwright sur le build web |
| `pnpm test:e2e:mobile` | racine | Maestro sur émulateur |
| `pnpm db:migrate` | `apps/api` | `prisma migrate dev` |
| `pnpm db:deploy` | `apps/api` | `prisma migrate deploy` (CI/prod) |
| `pnpm db:seed` | `apps/api` | `tsx prisma/seed.ts` |
| `pnpm db:reset` | `apps/api` | `prisma migrate reset --force` (local uniquement) |
| `pnpm db:studio` | `apps/api` | Prisma Studio |
| `pnpm api:openapi` | `apps/api` | génère `openapi.json` |
| `pnpm docker:up` / `docker:down` | racine | services locaux |
| `pnpm ios` / `pnpm android` | `apps/mobile` | build natif local |
| `pnpm desktop:dev` | `apps/desktop` | `tauri dev` (V1.1) |

### 3.3 Configuration Turborepo

```jsonc
// turbo.json (cible)
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".expo/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] }
  }
}
```

---

## 4. Configuration et variables d'environnement

### 4.1 Principes

| Règle | Détail |
|---|---|
| R1 | `.env` n'est **jamais** commité (déjà couvert par `.gitignore` à compléter) ; `.env.example` documente toutes les clés avec des valeurs factices |
| R2 | Chaque application a son propre fichier : `.env` (API), `apps/mobile/.env` (client Expo) |
| R3 | Les variables préfixées `EXPO_PUBLIC_` sont **embarquées dans le bundle** : jamais de secret |
| R4 | La configuration de l'API est validée au démarrage par un schéma Zod ; une variable manquante ou invalide empêche le boot (fail-fast) |
| R5 | Aucun secret dans les logs, les rapports de crash ou les réponses d'erreur |

### 4.2 Variables de l'API (`apps/api/.env`)

| Variable | Obligatoire | Défaut dev | Description |
|---|---|---|---|
| `NODE_ENV` | oui | `development` | `development` \| `test` \| `production` |
| `PORT` | non | `4000` | port HTTP |
| `API_PREFIX` | non | `/api/v1` | préfixe global |
| `APP_ORIGIN` | oui | `http://localhost:8081` | origine autorisée pour CORS et liens |
| `DATABASE_URL` | oui | `postgresql://focus:focus@localhost:5432/focus_dev?schema=public` | connexion PostgreSQL |
| `REDIS_URL` | oui | `redis://localhost:6379` | cache, files, rate limit |
| `JWT_ACCESS_SECRET` | oui | — | ≥ 32 caractères aléatoires |
| `JWT_ACCESS_TTL` | non | `15m` | durée de l'access token |
| `JWT_REFRESH_TTL` | non | `30d` | durée du refresh token |
| `JWT_ISSUER` | non | `focus-api` | claim `iss` |
| `JWT_AUDIENCE` | non | `focus-clients` | claim `aud` |
| `ARGON2_MEMORY_KIB` | non | `19456` | coût mémoire Argon2id |
| `ARGON2_TIME_COST` | non | `2` | itérations |
| `CORS_ORIGINS` | oui | `http://localhost:8081` | liste séparée par virgules |
| `RATE_LIMIT_PER_MINUTE` | non | `120` | quota par utilisateur |
| `S3_ENDPOINT` | non | `http://localhost:9000` | stockage objet |
| `S3_REGION` | non | `us-east-1` | région (MinIO l'ignore) |
| `S3_BUCKET` | non | `focus-dev` | bucket pièces jointes |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | non | `minio`/`minio123` | identifiants (MinIO local) |
| `S3_FORCE_PATH_STYLE` | non | `true` | requis par MinIO |
| `SMTP_HOST` / `SMTP_PORT` | non | `localhost`/`1025` | MailHog en dev |
| `SMTP_USER` / `SMTP_PASSWORD` | non | — | vide en dev |
| `MAIL_FROM` | non | `Focus <no-reply@focus.local>` | expéditeur |
| `EXPO_ACCESS_TOKEN` | non | — | envoi de push via Expo (prod) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | non | — | Web Push (V1.1) |
| `SENTRY_DSN` | non | — | erreurs serveur |
| `LOG_LEVEL` | non | `debug` | `fatal`→`trace` |
| `SYNC_RETENTION_DAYS` | non | `90` | rétention du journal de sync |
| `FEATURE_FLAGS` | non | — | `eisenhower=false,pomodoro=false` (V1.x) |

### 4.3 Variables du client Expo (`apps/mobile/.env`)

| Variable | Obligatoire | Défaut dev | Description |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | oui | `http://localhost:4000/api/v1` | base de l'API (émulateur : `http://10.0.2.2:4000/api/v1`) |
| `EXPO_PUBLIC_WS_URL` | non | `ws://localhost:4000` | WebSocket (V1.3) |
| `EXPO_PUBLIC_APP_SCHEME` | non | `focus` | deep links (`focus://`) |
| `EXPO_PUBLIC_SENTRY_DSN` | non | — | erreurs clientes (public par nature) |
| `EXPO_PUBLIC_ENV` | non | `development` | affichage d'un badge d'environnement |
| `EXPO_PUBLIC_FEATURE_POMODORO` | non | `false` | activation UI conditionnelle |

### 4.4 Variables du desktop Tauri (V1.1)

| Variable | Description |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | signature des mises à jour (CI uniquement, secret) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | mot de passe de la clé |
| `FOCUS_WEB_URL` | URL du bundle chargé par la WebView (`http://localhost:8081` en dev) |

### 4.5 Environnements

| Variable | `local` | `preview` | `staging` | `production` |
|---|---|---|---|---|
| `NODE_ENV` | development | production | production | production |
| Base | Docker locale | base éphémère par PR | copie anonymisée | managée + PITR |
| Secrets | `.env` local | secrets CI | coffre | coffre + rotation 90 j |
| `LOG_LEVEL` | debug | info | info | warn |
| Swagger | activé | activé | désactivé | désactivé |

---

## 5. Base de données

### 5.1 Prisma : conventions de schéma

```prisma
// extrait indicatif — apps/api/prisma/schema.prisma
model Task {
  id             String    @id @db.Uuid
  workspaceId    String    @db.Uuid
  projectId      String?   @db.Uuid
  parentId       String?   @db.Uuid
  title          String    @db.VarChar(500)
  description    String?   @db.Text
  status         TaskStatus   @default(TODO)
  priority       TaskPriority @default(NONE)
  dueDate        DateTime? @db.Date
  dueTime        String?   @db.VarChar(5)
  timezone       String    @default("Europe/Paris") @db.VarChar(64)
  completedAt    DateTime? @db.Timestamptz(3)
  sortOrder      Decimal   @db.Decimal(30, 15)
  recurrenceRule String?   @db.VarChar(400)
  recurrenceMode RecurrenceMode @default(FIXED)
  estimateMinutes Int?
  version        Int       @default(1)
  createdAt      DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt      DateTime  @updatedAt @db.Timestamptz(3)
  deletedAt      DateTime? @db.Timestamptz(3)

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  project   Project?  @relation(fields: [projectId], references: [id], onDelete: SetNull)
  parent    Task?     @relation("Subtasks", fields: [parentId], references: [id], onDelete: Cascade)
  subtasks  Task[]    @relation("Subtasks")
  tags      TaskTag[]
  reminders Reminder[]

  @@index([workspaceId, deletedAt])
  @@index([workspaceId, projectId, status, sortOrder])
  @@index([workspaceId, dueDate])
}
```

### 5.2 Migration : cycle de travail

```bash
# 1. Modifier schema.prisma
pnpm db:migrate -- --name add_task_estimate
# 2. Vérifier le SQL généré dans prisma/migrations/<timestamp>_add_task_estimate/migration.sql
# 3. Régénérer le client si nécessaire
pnpm --filter @focus/api prisma:generate
```

| Règle | Détail |
|---|---|
| Nommage | `snake_case` descriptif (`add_habit_entry_unique_index`) |
| Revue | Toute migration est lue en revue de code, y compris le SQL |
| Destructif | `DROP COLUMN` / `ALTER TYPE` interdits dans la même release que le code qui les utilise (expand/contract) |
| Données | Toute migration de données est accompagnée d'un script de vérification idempotent |
| Prod | `prisma migrate deploy` uniquement, jamais `migrate dev` |

### 5.3 Requêtes et performance

- `select` explicite en liste : jamais `include: { tasks: true }` non borné.
- Pagination par curseur (`id > cursor ORDER BY id LIMIT n`), pas d'`OFFSET`.
- Requêtes analytiques (`/stats/*`) en `$queryRaw` avec `Prisma.sql`, isolées dans `stats.repository.ts`.
- `EXPLAIN ANALYZE` obligatoire pour toute requête dépassant 50 ms en test.

### 5.4 Sauvegarde et restauration (local)

```bash
# Sauvegarde
docker exec -t focus-postgres pg_dump -U focus focus_dev > backup_$(date +%Y%m%d).sql

# Restauration
cat backup_20261122.sql | docker exec -i focus-postgres psql -U focus -d focus_dev
```

En production : sauvegarde complète quotidienne + WAL continu (PITR), rétention 30 jours, test de restauration trimestriel sur staging (doc 01 §14.4).

---

## 6. API

### 6.1 Génération de la documentation

```bash
pnpm api:openapi     # écrit apps/api/openapi.json depuis les schémas Zod
```

Swagger UI : `http://localhost:4000/docs` (dev/preview uniquement). Le fichier `openapi.json` est un artefact de CI : il est comparé au fichier commité, et toute divergence échoue le build (détection de contrat cassé).

### 6.2 Authentification — flux complet

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant A as API /auth
    participant DB as PostgreSQL

    C->>A: POST /auth/login { email, password }
    A->>DB: SELECT user, vérifie Argon2id
    A->>DB: INSERT Session (refreshTokenHash, familyId, deviceId)
    A-->>C: 200 { accessToken (15m), refreshToken (30j) }
    Note over C: accessToken en mémoire<br/>refreshToken en SecureStore (mobile)<br/>ou cookie HttpOnly (web)

    C->>A: GET /tasks (Authorization: Bearer ...)
    A-->>C: 401 SESSION_EXPIRED (token expiré)
    C->>A: POST /auth/refresh { refreshToken } (une seule requête, les autres sont en attente)
    A->>DB: vérifie hash, révocation, expiration
    A->>DB: révoque l'ancien, insère un nouveau (même familyId)
    A-->>C: 200 { accessToken, refreshToken }
    C->>A: rejoue les requêtes en attente
```

**Réutilisation détectée** : si un refresh token déjà consommé est présenté, l'API révoque toutes les sessions de la `familyId`, journalise l'événement et renvoie `401 SESSION_REVOKED`. Aucun token n'est jamais stocké en clair.

### 6.3 Exemples d'appels

**Créer une tâche**

```bash
curl -X POST http://localhost:4000/api/v1/tasks \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 018f2c3a-9a1e-7b3c-8f2a-1c2d3e4f5a6b" \
  -d '{
    "projectId": null,
    "title": "Préparer la revue de sprint",
    "priority": "HIGH",
    "dueDate": "2026-11-23",
    "dueTime": "09:30",
    "timezone": "Europe/Paris",
    "tags": [],
    "estimateMinutes": 45
  }'
```

Réponse `201` :

```json
{
  "id": "0192f3ca-7b1d-7c2e-9f4a-2b6c8d0e1f23",
  "workspaceId": "0192f3c0-1a2b-7c3d-8e4f-5a6b7c8d9e0f",
  "projectId": null,
  "title": "Préparer la revue de sprint",
  "status": "TODO",
  "priority": "HIGH",
  "dueDate": "2026-11-23",
  "dueTime": "09:30",
  "timezone": "Europe/Paris",
  "version": 1,
  "createdAt": "2026-11-22T14:05:11.482Z",
  "updatedAt": "2026-11-22T14:05:11.482Z"
}
```

**Lister les tâches d'aujourd'hui**

```bash
curl -s "http://localhost:4000/api/v1/tasks?status=TODO,IN_PROGRESS&dueTo=2026-11-22&limit=50" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Pousser des mutations hors ligne**

```bash
curl -X POST http://localhost:4000/api/v1/sync/push \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "0192f3d0-1111-7aaa-8bbb-ccccddddeeee",
    "mutations": [
      {
        "clientMutationId": "0192f3d1-2222-7aaa-8bbb-ccccddddeeee",
        "entityType": "task",
        "entityId": "0192f3ca-7b1d-7c2e-9f4a-2b6c8d0e1f23",
        "operation": "UPDATE",
        "baseVersion": 1,
        "payload": { "status": "DONE" }
      }
    ]
  }'
```

Réponse `200` :

```json
{
  "results": [
    {
      "clientMutationId": "0192f3d1-2222-7aaa-8bbb-ccccddddeeee",
      "status": "applied",
      "entityId": "0192f3ca-7b1d-7c2e-9f4a-2b6c8d0e1f23",
      "version": 2,
      "server": { "id": "0192f3ca-...", "status": "DONE", "version": 2, "completedAt": "2026-11-22T14:09:02.001Z" }
    }
  ],
  "cursor": 1058
}
```

Statuts de résultat : `applied`, `conflict` (avec `server` renseigné), `rejected` (avec `code` et `reason`).

**Pull**

```bash
curl -s "http://localhost:4000/api/v1/sync/pull?since=1042&limit=500" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Réponse : `{ "changes": [...], "nextCursor": 1058, "hasMore": false }`. Curseur trop ancien : `410` avec `code: "SYNC_CURSOR_EXPIRED"` → appeler `/sync/snapshot`.

### 6.4 Conventions d'erreur et de validation

Le détail du format `application/problem+json` et la liste des codes sont dans doc 01 §10.2. Côté client, l'intercepteur Axios normalise :

```ts
// forme d'erreur manipulée par l'UI — jamais un message brut du serveur
type AppError = {
  code: ErrorCode;          // 'VALIDATION_ERROR' | 'CONFLICT_VERSION' | ...
  status: number;
  message: string;          // clé i18n, pas une phrase
  fields?: Record<string, string>;
  requestId?: string;
};
```

Les messages affichés proviennent **toujours** de la clé i18n, jamais du texte serveur (doc 04 §i18n).

### 6.5 Concurrence et idempotence

| Mécanisme | Usage |
|---|---|
| `If-Match: "3"` | `PATCH` sur une entité ; `409 CONFLICT_VERSION` si la version a changé |
| `Idempotency-Key` | `POST` de création (évite les doublons après retry réseau) ; réponse mise en cache 24 h dans Redis |
| `clientMutationId` | Idempotence du `/sync/push`, persistée avec la mutation appliquée |

### 6.6 WebSocket (V1.3)

```ts
// handshake
io("wss://api.focus.app", { auth: { token: accessToken }, transports: ["websocket"] });

// abonnement
socket.emit("subscribe", { channel: "project", id: projectId });

// événement reçu
socket.on("task.updated", (event) => {
  // { entityId, version, patch, actorId, at }
  if (event.version > localVersion) applyPatch(event);
});
```

---

## 7. Configuration des clients

### 7.1 Client HTTP (Axios)

```ts
// apps/mobile/src/data/http/client.ts — cible
const http = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 15_000,
  headers: { "X-Client-Platform": Platform.OS, "X-Client-Version": appVersion },
});

http.interceptors.request.use((config) => {
  const token = useSessionStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers["X-Request-Id"] = uuidv7();
  return config;
});

// file d'attente de refresh : une seule requête /auth/refresh pour N 401 simultanés
```

### 7.2 Exposition du bundle web

```bash
pnpm build:web
# sortie : apps/mobile/dist/
# à servir avec fallback SPA (toutes les routes -> index.html)
```

Le service worker (Workbox) met en cache le shell applicatif uniquement ; les données sont gérées par SQLite/`localStorage` applicatif, pas par le service worker (évite les incohérences de cache HTTP sur des données personnelles).

### 7.3 App desktop Tauri (V1.1)

| Étape | Commande |
|---|---|
| Développement | `pnpm --filter @focus/mobile build:web` puis `pnpm --filter @focus/desktop dev` |
| Build | `pnpm --filter @focus/desktop build` |
| Sorties | `src-tauri/target/release/bundle/{msi,nsis,dmg,deb,appimage}` |

Configuration clé de `tauri.conf.json` : `build.frontendDist` pointe vers `../mobile/dist`, `app.security.csp` restrictive (aucun `unsafe-eval`), capacités Tauri minimales (notifications, autostart, global-shortcut, tray) déclarées explicitement.

---

## 8. Tests

### 8.1 Pyramide et outils

```mermaid
flowchart TB
    e2e["E2E — Playwright (web), Maestro (Android)<br/>~25 scénarios"]
    int["Intégration — Vitest + Postgres éphémère<br/>repositories, modules, sync"]
    unit["Unitaires — Vitest<br/>services, policies, parseurs, hooks, utils"]
    e2e --> int --> unit
```

| Niveau | Outil | Portée | Cible |
|---|---|---|---|
| Unitaire | Vitest | fonctions pures, services isolés, parseur de création rapide, calcul RRULE, politiques de rôle | ≥ 80 % lignes sur le domaine |
| Composant | React Native Testing Library | composants critiques (carte de tâche, formulaire, minuteur) | parcours clés |
| Intégration API | Vitest + `@testcontainers/postgresql` | modules NestJS avec vraie base, migrations appliquées | tous les modules MVP |
| Contrat | Vitest + `openapi.json` | cohérence Zod ↔ OpenAPI | bloquant |
| E2E web | Playwright | inscription → tâche → aujourd'hui → kanban → sync | 25 scénarios |
| E2E mobile | Maestro | création rapide, complétion, hors ligne | 10 scénarios |
| Charge | k6 | `/sync/pull`, `/tasks` | doc 02 RNF-03..06 |

### 8.2 Commandes

```bash
pnpm test                                   # unitaires, tout le monorepo
pnpm --filter @focus/api test:watch         # watch sur l'API
pnpm --filter @focus/api test:integration   # intégration (Docker requis)
pnpm test:e2e:web                           # Playwright (build web requis)
pnpm test:e2e:mobile                        # Maestro (émulateur requis)
```

### 8.3 Tests de convergence (obligatoires, sync)

Scénarios minimaux, exécutés en intégration et en E2E :

| ID | Scénario | Attendu |
|---|---|---|
| SYNC-01 | Deux clients créent une tâche hors ligne avec le même titre | 2 tâches distinctes (UUID différents), aucun doublon après push |
| SYNC-02 | Client A modifie le statut, client B modifie la priorité, push concurrent | les deux champs sont appliqués (fusion par champ), `version` cohérente |
| SYNC-03 | Client A supprime, client B modifie 10 s plus tard | suppression retenue, modification conservée en `conflictCopy` |
| SYNC-04 | Push du même lot deux fois (retry réseau) | une seule application (idempotence `clientMutationId`) |
| SYNC-05 | Curseur antérieur à la rétention | `410 SYNC_CURSOR_EXPIRED` puis `snapshot` réussi |
| SYNC-06 | 500 mutations aléatoires sur 2 clients | état final identique sur les deux clients et le serveur |
| SYNC-07 | Coupure réseau pendant un push | aucune mutation perdue, reprise sans doublon |

### 8.4 Qualité minimale exigée en CI

| Contrôle | Bloquant |
|---|---|
| `pnpm typecheck` | oui |
| `pnpm lint` (0 warning) | oui |
| Tests unitaires + intégration | oui |
| Couverture du domaine < 80 % | oui |
| `openapi.json` désynchronisé | oui |
| `pnpm audit --audit-level high` | oui |
| E2E web (parcours critiques) | oui sur `main` |
| Lighthouse (performance ≥ 85, a11y ≥ 95) | oui sur le build web |

---

## 9. CI/CD

### 9.1 Workflows cibles

| Fichier | Déclencheur | Étapes |
|---|---|---|
| `.github/workflows/ci.yml` | PR + push sur `main` | setup Node 22 + pnpm, cache, lint, typecheck, tests, build API, build web, openapi check, audit |
| `.github/workflows/e2e.yml` | PR (label `e2e`) + `main` | build, Playwright, artefacts |
| `.github/workflows/android.yml` | tag + manuel | EAS Build (profil `preview`/`production`) |
| `.github/workflows/desktop.yml` | tag | matrice `windows-latest`, `macos-latest`, `ubuntu-22.04` → bundles Tauri + signature |
| `.github/workflows/deploy-api.yml` | `main` | image Docker → registry → staging → smoke tests → approbation → production |
| `.github/workflows/deploy-web.yml` | `main` | `expo export` → CDN, invalidation |

### 9.2 Image Docker de l'API

```dockerfile
# cible — apps/api/Dockerfile
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter @focus/api...

FROM deps AS build
COPY . .
RUN pnpm --filter @focus/api build && pnpm --filter @focus/api prisma:generate

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/prisma ./prisma
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
```

Le worker utilise la même image avec `CMD ["node", "dist/worker.js"]`.

### 9.3 Déploiement de l'API

| Étape | Commande / action |
|---|---|
| 1. Build image | CI, tag = SHA court + version |
| 2. Migrations | `pnpm db:deploy` en tâche de pré-déploiement (staging auto, prod avec approbation) |
| 3. Déploiement | rolling update, 2 instances minimum, readiness `/health/ready` |
| 4. Smoke tests | `/health`, login du compte de test, création + suppression d'une tâche |
| 5. Rollback | image précédente ; les migrations sont additives donc compatibles |

### 9.4 Publication mobile et desktop

| Cible | Outil | Points de vigilance |
|---|---|---|
| Android | EAS Build (`eas build -p android --profile production`) | `versionCode` incrémenté, keystore géré par EAS, test interne avant déploiement |
| OTA | EAS Update (canaux `preview`, `production`) | uniquement du JS/assets ; jamais de changement natif |
| Windows | Tauri + signature Authenticode | certificat à renouveler, smart screen |
| macOS | Tauri + notarisation Apple | identité développeur, `notarytool` |
| Linux | AppImage + `.deb` | test sur Ubuntu 22.04 et Fedora récent |

---

## 10. Observabilité et exploitation

### 10.1 Logs

Format JSON structuré, une ligne par événement :

```json
{
  "level": "error",
  "time": "2026-11-22T14:12:04.118Z",
  "requestId": "req_01J8ZQ7...",
  "userId": "0192f3c0-...",
  "workspaceId": "0192f3c0-...",
  "route": "PATCH /api/v1/tasks/:id",
  "status": 409,
  "code": "CONFLICT_VERSION",
  "durationMs": 42,
  "msg": "request failed"
}
```

Interdits dans les logs : tokens, mots de passe, corps de requête complet, e-mail en clair (masqué : `a***@example.com`).

### 10.2 Métriques et alertes

| Métrique | Seuil d'alerte |
|---|---|
| Taux 5xx | > 1 % sur 5 min |
| p95 latence | > 500 ms sur 10 min |
| Profondeur file `reminders` | > 1 000 jobs |
| Jobs en échec | > 20 en 15 min |
| Connexions Postgres | > 80 % du pool |
| Mémoire Redis | > 75 % |
| Échecs de refresh token | pic > 50/min (tentative d'abus) |

### 10.3 Runbooks essentiels

| Incident | Première action | Vérification |
|---|---|---|
| API indisponible | vérifier `/health/ready`, logs du conteneur, état Postgres/Redis | rollback image si déploiement récent |
| Rappels non envoyés | inspecter la file BullMQ et le worker | rejouer les jobs échoués (`job.retry`) |
| Sync en boucle / curseur bloqué | vérifier `/sync/pull` et la taille du journal | purger les tombstones, forcer `snapshot` côté client |
| Base saturée | identifier la requête lente (`pg_stat_statements`) | ajouter index ou borner la requête |
| Fuite de secret | rotation immédiate, révocation des sessions, audit des accès | doc 01 §15 |
| Restauration | PITR vers un environnement isolé | vérifier l'intégrité avant bascule |

---

## 11. Dépannage (local)

| Symptôme | Cause probable | Solution |
|---|---|---|
| `pnpm install` échoue sur `engines` | Node ≠ 22 | `nvm use 22` |
| Metro ne résout pas `@focus/contracts` | `watchFolders` mal configuré | vérifier `metro.config.js` (workspaces) |
| `PrismaClientInitializationError` | Postgres non démarré | `pnpm docker:up` |
| `P1001` connexion refusée | `DATABASE_URL` incorrecte / port occupé | `docker compose ps`, vérifier `.env` |
| Migration « drift detected » | base modifiée à la main | `pnpm db:reset` en local |
| Erreur CORS sur le web | `APP_ORIGIN` ≠ origine réelle | aligner `APP_ORIGIN` et `CORS_ORIGINS` |
| `localhost` injoignable depuis l'émulateur Android | réseau de l'émulateur | utiliser `10.0.2.2` |
| Session expirée en boucle | horloge système décalée / refresh révoqué | vérifier l'heure, se reconnecter |
| Notifications absentes sur Android | permissions refusées, économiseur de batterie | vérifier les réglages système, tester avec `expo-notifications` en dev |
| Build Tauri échoue sous Windows | WebView2 ou Rust absent | installer WebView2 Runtime et `rustup` |

---

## 12. Sécurité opérationnelle

| Sujet | Procédure |
|---|---|
| **Rotation des secrets** | Tous les 90 jours (`JWT_*`, `S3_*`, `SMTP_*`) ; rotation sans coupure via double clé pour les JWT (acceptation de l'ancienne pendant 24 h) |
| **Accès** | Principe du moindre privilège ; aucun accès direct en production depuis un poste de développement ; bastion ou tunnel audité |
| **Sauvegardes** | Chiffrées au repos, test de restauration trimestriel documenté |
| **Dépendances** | Renovate hebdomadaire, `pnpm audit` bloquant, revue des changements majeurs |
| **Incident** | Journal d'incident, post-mortem sans blâme sous 5 jours ouvrés |
| **Données personnelles** | Registre de traitement, sous-traitants listés, export/suppression à la demande (doc 02 RF-71/RF-72) |

---

## 13. Annexes

### 13.1 Fichiers de configuration attendus (M0)

| Fichier | Rôle |
|---|---|
| `package.json` (racine) | scripts, `engines`, `packageManager` |
| `pnpm-workspace.yaml` | espaces de travail |
| `turbo.json` | graphe de tâches |
| `.npmrc` | `engine-strict=true`, `node-linker=hoisted` **non** (incompatible RN) |
| `.nvmrc` | `22` |
| `.env.example` | toutes les variables, valeurs factices |
| `tsconfig.base.json` | `strict`, `noUncheckedIndexedAccess`, `paths` |
| `apps/api/tsconfig.json`, `nest-cli.json` | API |
| `apps/api/prisma/schema.prisma` | modèle de données |
| `apps/mobile/app.config.ts`, `metro.config.js`, `babel.config.js` | Expo |
| `apps/desktop/src-tauri/tauri.conf.json` | desktop (V1.1) |
| `docker/compose.yml` | services locaux |
| `eslint.config.js` | règles partagées (config plate) |
| `.prettierrc` | formatage |
| `playwright.config.ts` | E2E web |

### 13.2 Matrice de correspondance des ports

| Service | Port | Protocole |
|---|---|---|
| API HTTP | 4000 | HTTP |
| WebSocket | 4000 | WS (`/ws`) |
| Expo / Metro / Web dev | 8081 | HTTP |
| PostgreSQL | 5432 | TCP |
| Redis | 6379 | TCP |
| MinIO API / console | 9000 / 9001 | HTTP |
| MailHog SMTP / UI | 1025 / 8025 | SMTP / HTTP |

---

**Fin du document 03.**
