# 03 — Documentation technique

> **Projet :** Focus
> **Statut :** v1.0 — procédures de référence pour installer, configurer, tester et déployer
> **Public :** développeurs, DevOps, QA, agents IA contributeurs
> **Documents liés :** [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) · [02-CAHIER-DES-CHARGES.md](./02-CAHIER-DES-CHARGES.md) · [04-BEST-PRACTICES.md](./04-BEST-PRACTICES.md) · [05-SKILLS-AND-TOOLS.md](./05-SKILLS-AND-TOOLS.md)

> **Avertissement d'état (2026-11-22).** Le socle **M0** est en place et commité (`806c3df`) : configuration racine (pnpm 9 + Turborepo, `tsconfig.base.json`, ESLint plat, Prettier, `.npmrc`, `.env.example`, `docker/compose.yml`), `packages/config`, squelette `apps/api` (Fastify, préfixe `/api/v1`, `GET /health` et `GET /health/ready`) et squelette `apps/mobile` (Expo SDK 52 + Expo Router, écran unique). Aucune logique métier n'existe encore : les sections §3 à §13 décrivent la procédure **cible** des phases suivantes (Prisma, Redis, authentification, sync, tests, déploiement) et restent à implémenter puis valider.
>
> Vérifications **réellement exécutées** sur ce dépôt : `pnpm install` (lockfile `9.0`), `pnpm typecheck` (2 tâches, code 0), `pnpm lint` (0 avertissement, code 0), `pnpm test` (1 fichier, 2 tests passés, code 0), `pnpm --filter @focus/api build` (code 0), API démarrée puis `GET /health` et `GET /health/ready` → `200` (`database`/`redis` = `not_configured`), et `pnpm --filter @focus/mobile build:web` → `Exported: dist`, 3 routes statiques, code 0.
>
> **Réalignement Node (2026-11-24).** Le poste de développement tourne désormais sous **Node 22.23.5** (nvm-windows 2.0.1, version `default`) et **pnpm 9.15.9** (via Corepack), donc dans la plage `engines` (`>=22.12 <23`, pnpm `>=9 <10`). Vérifications relancées **sans aucun `--config.engine-strict=false`**, `engine-strict=true` restant actif dans `.npmrc` : `pnpm install` → code `0` (lockfile à jour, `Done in 11.9s`, `+23 −61` paquets) ; `pnpm typecheck` → code `0` ; `pnpm lint` → code `0` ; `pnpm test` → code `0` (1 fichier, 2 tests) ; `pnpm build:web` → code `0` (`Exported: dist`, 3 routes statiques). Ces trois premiers contrôles étant revenus du cache Turborepo, ils ont été rejoués avec `turbo run typecheck lint test --force` (0 tâche en cache) → code `0`. L'état « Node 25 hors plage » décrit en §1.3 est donc **clos**.
>
> Limites connues : la **CI n'existe pas encore** (aucun workflow) ; `docker compose`, l'émulateur Android, le démarrage de Metro et l'ouverture réelle des pages exportées ne sont **pas** vérifiés ; l'installation de Node 22 a nécessité un miroir local (voir §1.3) car nvm 2.0.1 impose un délai de téléchargement de 30 s.

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

### 1.3 Réalignement du poste de développement (fait le 2026-11-24)

```text
Avant  : Node v25.8.1 (MSI global), npm 11.11.0, pnpm absent.
Après  : Node v22.23.5 (nvm-windows 2.0.1, `default`), pnpm 9.15.9, npm 10.x.
```

Node 25 n'est pas une version LTS et n'est pas supporté par les versions stables d'Expo/Nest au moment de la rédaction (doc 01, ADR-016). Procédure de référence :

```bash
# Option A — nvm (macOS/Linux/WSL)
nvm install 22
nvm use 22

# Option B — nvm-windows
nvm install 22
nvm use 22

# Activation de pnpm via Corepack (fourni avec Node)
corepack enable
corepack prepare pnpm@9 --activate
pnpm -v   # doit afficher 9.x
```

Le fichier `.nvmrc` (`22`) et `engines` dans `package.json` verrouillent la contrainte ; `pnpm install` échoue volontairement si la version ne correspond pas (via `engine-strict=true` dans `.npmrc`).

#### 1.3.1 Ce qui a réellement été fait sur le poste Windows

| Étape | Détail |
|---|---|
| Désinstallation de Node 25 | MSI global retiré (`msiexec /x{…} /qn /norestart`, code `0`). nvm-windows exige que le répertoire de lien (`C:\Program Files\nodejs`) **ne soit pas** un répertoire physique occupant. |
| nvm-windows 2.0.1 | Installeur **Inno Setup** : `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-` (`/S`, flag NSIS, est ignoré). Racine : `%LOCALAPPDATA%\Author Software\nvm`, `NVM_HOME` posé côté utilisateur. En 2.x, `NVM_SYMLINK` n'existe plus et il n'y a **pas** de sous-commande `nvm root`. |
| `nvm install 22` | La 22 LTS courante est **22.23.5**. nvm 2.0.1 applique un **délai de 30 s** au téléchargement de l'archive : sur un lien lent, `nvm install` échoue avec `context deadline exceeded`. Contournement utilisé : téléchargement de l'archive officielle `node-v22.23.5-win-x64.7z` hors nvm, vérification du **SHA-256** contre `dist/v22.23.5/SHASUMS256.txt`, puis miroir local servi en HTTP et pointé par `nvm config set node_mirror=http://127.0.0.1:<port>/dist` + `allow_insecure_downloads=true`. |
| Remise à l'état par défaut | Après installation : `nvm config set allow_insecure_downloads=false` et `node_mirror=https://nodejs.org/dist`. Aucun miroir ni flag d'insécurité ne reste actif. |
| pnpm | Fourni par Corepack (`pnpm -v` → `9.15.9`, conforme à `packageManager`) : aucune installation globale hors Corepack. |

Une version majeure hors plage reste un **blocage à signaler**, jamais à contourner : `engine-strict=true` doit rester actif. `--config.engine-strict=false` n'est **pas** une procédure de dépannage — uniquement un constat d'état historique, désormais clos.

#### 1.3.2 Contrôle automatique de l'environnement (`pnpm setup`)

Avant tout `pnpm install` sur un poste neuf, lancer :

```bash
pnpm run setup
```

> **Ne pas taper `pnpm setup` sans `run`.** pnpm possède une commande **intégrée** du même nom, qui configure `PNPM_HOME` et modifie le `PATH` utilisateur — elle n'exécute pas ce script et n'affiche aucun contrôle. `pnpm run setup` appelle bien `scripts/setup.mjs` (vérifié : le builtin écrit `PNPM_HOME` dans `HKCU\Environment`, le script n'écrit rien).

`scripts/setup.mjs` est **en lecture seule** : il n'installe rien et ne modifie aucun fichier. Il contrôle quatre points et sort en code `1` si l'un des deux premiers échoue.

| Contrôle | Règle | En cas d'échec |
|---|---|---|
| Node | version courante contre `engines.node` (`>=22.12 <23`) | sortie `1` + rappel de `nvm use 22` |
| pnpm | version **réellement résolue** contre `engines.pnpm` (`>=9 <10`) | sortie `1` + rappel de `corepack prepare pnpm@9 --activate` |
| Résolution de pnpm | affiche le binaire trouvé (`where pnpm` / `which pnpm`) | avertit si `pnpm` passe par un shim nvm |
| Docker | `docker` puis `docker compose version` | **avertissement seulement** : `docker compose` est requis pour Postgres/Redis/MinIO/MailHog (§2.3), pas pour coder |

Le script n'analyse que la forme de plage utilisée par ce dépôt (`>=X.Y <Z`). Face à une autre forme, il affiche `warn` **« plage non reconnue »** au lieu de considérer la contrainte comme satisfaite : une plage non comprise ne doit jamais passer pour un succès.

#### 1.3.3 Procédure nvm-windows, dans l'ordre (et ses pièges)

1. **Désinstaller tout Node global** (MSI officiel, ou `winget`). nvm-windows ne peut pas poser son lien si `C:\Program Files\nodejs` (ou `%NODE_SYMLINK%`) est un répertoire physique. Contrôle : `node -v` doit échouer avant l'étape 3.
2. **Installer nvm-windows** (2.0.1 au moment de la rédaction). L'installeur est en **Inno Setup** : `nvm-setup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-`. Le flag NSIS `/S` est ignoré et donne l'impression d'un blocage.
3. **Installer Node** : `nvm install 22` puis `nvm use 22`, vérifié par `nvm list` (l'étoile doit être sur la 22) et `node -v`.
4. **Exposer pnpm** : Node 22 fournit Corepack → `corepack enable`, puis `pnpm -v` (doit donner `9.15.9`, la version de `packageManager`). Aucune installation globale de pnpm.
5. **Valider** : `pnpm run setup`, puis `pnpm install` (sans aucun `--config.engine-strict=false`).

| Symptôme | Cause réelle | Solution |
|---|---|---|
| `FAILED v>=22.12 <23 : unknown alias …` puis `error: AutoInstallFailed`, y compris pour un simple `node -v` | **Shim de nvm 2.x**, pas Node ni pnpm : dans un dossier dont `package.json` déclare un `engines` (ou un `.nvmrc`) non satisfaisable, le shim intercepte `node` **et** `pnpm`, tente d'installer la version correspondante et échoue avant que Node ne démarre. Message sans rapport avec la vraie cause. | `nvm use 22`, ou vérifier `nvm list`. Pour contourner le shim et voir la vraie erreur : appeler directement `%NVM_HOME%\installs\v22.23.5\node.exe`. |
| `ERR_PNPM_UNSUPPORTED_ENGINE` à `pnpm install` | Comportement **attendu** : c'est `engine-strict=true` qui refuse une version de Node hors `engines`. C'est ce message qu'on voit en CI (sans shim nvm). | `nvm use 22`. Ne jamais contourner avec `--config.engine-strict=false`. |
| `pnpm` répond mais `pnpm setup` signale un binaire sous `%LOCALAPPDATA%\Author Software\nvm\.nodejs\pnpm` | Shim de nvm : c'est le Node **actif** qui répond, pas une installation indépendante. Après un `nvm use` dans un autre terminal, les shims peuvent pointer sur l'ancienne version. | Lancer `nvm use 22` **puis** `corepack enable` dans le même terminal, et revérifier avec `where pnpm`. |
| `nvm install` échoue en `context deadline exceeded` | nvm 2.0.1 impose un **délai de 30 s** au téléchargement de l'archive Node. | Réseau lent : télécharger `node-v<version>-win-x64.7z` depuis `https://nodejs.org/dist/v<version>/`, **vérifier son SHA-256** contre `SHASUMS256.txt`, puis servir un miroir local et pointer `nvm config set node_mirror=…` (voir §1.3.1). Remettre `node_mirror` sur `https://nodejs.org/dist` et `allow_insecure_downloads=false` ensuite. |
| nvm refuse de créer le lien vers `C:\Program Files\nodejs` | Un Node global est encore installé à cet emplacement. | Désinstaller ce Node (étape 1), supprimer le répertoire s'il subsiste, relancer l'installation nvm. |
| `pnpm setup` affiche « Setup complete » et aucun contrôle | C'est le **builtin pnpm**, pas ce dépôt : il pose `PNPM_HOME` et modifie le `PATH` utilisateur. | Utiliser `pnpm run setup` (§1.3.2). Le builtin est sans danger mais n'effectue aucune vérification. |

> Le miroir local de l'étape 3 est un **contournement de réseau**, pas une procédure normale : il ne doit jamais servir à installer une version hors plage `engines`, et la vérification SHA-256 n'est pas optionnelle.

---

## 2. Installation

### 2.1 Clonage et dépendances

```bash
git clone <url-du-depot> focus-all
cd focus-all
pnpm install
```

`pnpm install` exécute les `postinstall` utiles (génération du client Prisma). Sur Windows, si les scripts sont bloqués, utiliser `pnpm install --config.enable-pre-post-scripts=true` — mais la configuration recommandée est `pnpm-workspace.yaml` + scripts explicites, sans dépendre des postinstall.

### 2.2 Mode de résolution des dépendances (pnpm + Expo)

Le `.npmrc` de la racine **doit** contenir `node-linker=hoisted` tant que l'application mobile reste sur **Expo SDK 52** :

```ini
# .npmrc
engine-strict=true
node-linker=hoisted
```

| Point | Détail |
|---|---|
| Contrainte amont | Expo ne supporte les **dépendances isolées** de pnpm qu'à partir du **SDK 54** (voir `docs.expo.dev/guides/monorepos`). Le projet cible le SDK 52 : le layout isolé, défaut de pnpm 9, est hors support. |
| Symptôme si absent | `expo export --platform web` échoue en cascade : `Unable to resolve module @react-navigation/native`, puis `expo-font/build/server`, puis `@babel/runtime`. Avec le layout isolé, Metro ne cherche que dans `nodeModulesPaths` et ne voit pas les dépendances internes d'`expo-router`, situées à côté de lui dans `node_modules/.pnpm/`. |
| Conséquence de `hoisted` | `node_modules` aplati à la racine (proche de npm) : perte de l'isolation stricte de pnpm. Les imports non déclarés redeviennent possibles — la revue de code reste responsable de la propreté des `dependencies`. |
| `metro.config.js` | Ne **pas** activer `config.resolver.disableHierarchicalLookup = true` avec ce linker : la résolution hiérarchique doit rester disponible. `watchFolders` et `nodeModulesPaths` restent nécessaires pour les paquets `@focus/*` du monorepo. |
| Changement de linker | Supprimer tous les `node_modules` (`rm -rf node_modules apps/*/node_modules packages/*/node_modules`) puis `pnpm install` : pnpm refuse de réutiliser une arborescence installée avec un autre linker. |
| Retour au layout isolé | Envisageable seulement après migration vers Expo SDK 54+, à traiter comme une tâche dédiée (réinstallation complète + validation de `pnpm build:web`). |

> **Correction d'une erreur de ce document.** La première version de cette annexe (§13.1) indiquait que `node-linker=hoisted` était « incompatible React Native ». C'est faux pour la combinaison retenue (React Native 0.76 / Expo SDK 52) : l'absence de ce réglage a bloqué l'export web du socle M0.

#### 2.2.1 `query-string` déclaré par l'app mobile

`expo-router` 4.0.x importe `query-string` à l'exécution (`build/fork/getPathFromState.js`) **sans le déclarer** dans ses `dependencies` : il comptait sur `@react-navigation/core`, dont la plage de versions a dérivé et ne le fournit plus. Le paquet doit donc être déclaré par l'application consommatrice :

```jsonc
// apps/mobile/package.json
"dependencies": {
  "query-string": "^7.1.3"
}
```

| Règle | Détail |
|---|---|
| Version | **v7 obligatoire** (CJS). La v9 est ESM-only et casse le `require` interne d'`expo-router` (`TypeError: queryString.stringify is not a function`). |
| Portée | Dépendance de `@focus/mobile` uniquement : ni l'API ni les `packages/*` ne l'utilisent. |
| Durée de vie | À conserver tant qu'`expo-router` 4.x est installé ; à réévaluer lors de la montée de SDK (isolation pnpm supportée et correctif amont). |
| Vérification | `pnpm --filter @focus/mobile build:web` doit produire les routes statiques `/`, `/_sitemap` et `/+not-found` dans `apps/mobile/dist/`, sans erreur de résolution Metro. |

Constaté au déblocage de l'export M0 (2026-11-22, Node 25.8.1 hors plage `engines`) puis **revérifié sous Node 22.23.5 / pnpm 9.15.9** (2026-11-24, `engine-strict=true` actif) : `Exported: dist`, 3 routes statiques, bundle web de 912 kB, code de sortie `0`.

### 2.3 Services locaux

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

### 2.4 Base de données

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

### 2.5 Démarrage

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

### 2.6 Vérification de l'installation

```bash
pnpm typecheck && pnpm lint && pnpm test
curl -s http://localhost:4000/health/ready | jq
```

Attendu : `{"status":"ok","checks":{"database":"up","redis":"up"}}`. À ce stade du socle, `database` et `redis` valent `not_configured` (aucun module Prisma/Redis branché).

### 2.7 Contrats partagés (`packages/contracts`)

`@focus/contracts` est la **seule** source des schémas entrants/sortants de l'API (doc 01 R2 : dépendance Zod uniquement). L'API et, plus tard, le client mobile consomment ses types inférés — aucun DTO redéfini localement (TS-1).

```bash
pnpm --filter @focus/contracts build      # dist/ + .d.ts (nécessaire avant l'API)
pnpm --filter @focus/contracts test       # schémas : cas nominaux et rejets
```

| Fichier | Contenu |
|---|---|
| `src/error-codes.ts` | `ERROR_CODES` (`as const`) + `errorCodeSchema` : codes **stables** et publics, seuls éléments testables par un client |
| `src/problem-details.ts` | `problemDetailsSchema` (RFC 9457) et `PROBLEM_CONTENT_TYPE` = `application/problem+json` |
| `src/task.ts` | `TASK_STATUSES`, `TASK_PRIORITIES`, `taskDraftSchema` (entrée, valeurs par défaut serveur), `taskSchema` (entité), `pageQuerySchema`/`taskListQuerySchema` (curseur, jamais d'offset) |

Le paquet est compilé en `dist/` (CommonJS, `.d.ts`) : Turborepo garantit l'ordre via `build` avant `typecheck`/`lint`/`build` des applications (`dependsOn: ["^build"]`).

#### 2.7.1 Erreurs HTTP : `application/problem+json`

`ProblemDetailsFilter` (global, `APP_FILTER` dans `AppModule`) applique la RFC 9457 à **toute** exception, y compris les 404 de route inconnue : Nest enregistre lui-même son gestionnaire 404, qui traverse le filtre — inutile et interdit d'appeler `setNotFoundHandler` sur Fastify (erreur `Not found handler already set`).

```json
{"type":"about:blank","title":"Not Found","status":404,
 "code":"NOT_FOUND","instance":"/api/v1/inconnu","requestId":"req-3"}
```

| Statut | `code` |
|---|---|
| 400, 422 | `VALIDATION_FAILED` |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT_VERSION` |
| 429 | `RATE_LIMITED` |
| ≥ 500 | `INTERNAL` |
| autre 4xx | `REQUEST_REJECTED` |

Règle de sécurité (N-7) : `detail` est **omis** sur les 5xx — le message interne part dans les logs avec le `requestId`, jamais dans la réponse.

**Erreurs du domaine et clé i18n.** Un refus métier (tâche absente, version obsolète, version absente, curseur illisible, champ invalide) est levé par le service en `DomainError` (`apps/api/src/common/domain-error.ts`) : `code`, `status` et `messageKey` viennent d'un **catalogue indexé par la clé**, et les paramètres sont typés par clé (`{ currentVersion }`, `{ field }`). Le filtre recopie ces éléments dans le problem et **omet `detail`** : aucune phrase ne circule, le client traduit `messageKey` avec `params`. `detail` reste réservé aux erreurs de schéma Zod (liste des champs fautifs, déjà diagnostique) et aux exceptions HTTP hors domaine. Exemple de conflit résolu par la clé :

```json
{"type":"about:blank","title":"Precondition Failed","status":412,
 "code":"CONFLICT_VERSION","instance":"/api/v1/tasks/42","requestId":"req-4",
 "messageKey":"task.version_precondition_failed","params":{"currentVersion":3}}
```

### 2.8 Endpoints tâches (repository en mémoire)

Première feature verticale : `controller → service → repository`, avec validation par `taskDraftSchema` et sortie d'erreur par le filtre problem+json.

| Méthode | Route | Corps / paramètres | Réponse |
|---|---|---|---|
| `POST` | `/api/v1/tasks` | `taskDraftSchema` (seul `title` est obligatoire) | `201` + `taskSchema` |
| `GET` | `/api/v1/tasks` | `taskListQuerySchema` : `limit` (1-100, défaut 50), `cursor`, `status`, `projectId` | `200` + `{ items, nextCursor }` |
| `GET` | `/api/v1/tasks/:id` | UUID dans le chemin | `200` + `taskSchema`, sinon `404 NOT_FOUND` / `400 VALIDATION_FAILED` |
| `PATCH` | `/api/v1/tasks/:id` | `taskUpdateSchema` (tout optionnel) + `version` dans le corps **ou** `If-Match` | `200` + `taskSchema` (version incrémentée), `409 CONFLICT_VERSION` si la version ne correspond plus |
| `DELETE` | `/api/v1/tasks/:id` | `?version=` **ou** `If-Match` | `204` sans corps, `409 CONFLICT_VERSION` si la version ne correspond plus |

```bash
curl -s -X POST http://localhost:4000/api/v1/tasks \
  -H 'content-type: application/json' \
  -d '{"title":"  Acheter du pain  ","priority":"HIGH"}'
# 201 → titre rogné, status=TODO, version=0, completedAt=null, tagIds=[]
```

Propriétés importantes :

- **Identifiants UUID v7** générés côté serveur (`src/common/uuid-v7.ts`) : ordonnés dans le temps, comme l'impose ADR-017.
- **Pagination par curseur *keyset*** : le curseur (`base64url`) transporte la **clé de tri** de la dernière tâche vue — `{ sortOrder, id }` —, jamais un rang. Si une tâche est créée ou déplacée entre deux pages, aucune tâche n'est sautée ni répétée. Un curseur illisible, incomplet ou portant un id non UUID renvoie `400 VALIDATION_FAILED`. La réponse porte `nextCursor: null` en fin de parcours.
- **Authentification et workspace de session** : toutes les routes `/api/v1/*` exigent `Authorization: Bearer <jwt>` — seules les sondes `/health` sont publiques (`@Public()`). La garde globale (`AuthGuard`, enregistrée en `APP_GUARD`) vérifie signature, `iss`, `aud` et algorithme (`HS256`) avec `JWT_ACCESS_SECRET` ; un secret absent ou plus court que 32 caractères empêche le démarrage (fail-fast, §4). Elle valide ensuite `sub` et `workspaceId` comme UUID et publie un contexte `{ userId, workspaceId }` : le workspace vient **uniquement** des claims du jeton, jamais du corps ni de la query (N-3/S-2). Le controller le lit via `@CurrentAuth()` et le transmet au service, qui scope le repository. Erreurs : jeton absent ou invalide → `401 UNAUTHENTICATED` (`auth.missing_token` / `auth.invalid_token`) ; jeton expiré → `401 SESSION_EXPIRED` (`auth.session_expired`), distinct pour que le client tente un refresh. `POST /auth/login` et le refresh rotatif (ADR-010) restent **non implémentés** : ils exigent la table utilisateur, donc Prisma.
- **Jeton de développement** : sans endpoint de connexion, `pnpm api:token <userId> <workspaceId>` signe un jeton local avec `JWT_ACCESS_SECRET` (`apps/api/scripts/dev-token.cjs`) ; aucun secret n'est commité.
- **Contrôle optimiste obligatoire** : `PATCH` et `DELETE` exigent la version attendue, sous forme de champ `version`, d'en-tête `If-Match` (`3`, `"3"` ou `W/"3"`) ou de query `version`. Sans elle : `400 VALIDATION_FAILED` — jamais d'écrasement silencieux. Si le corps porte une version **et** un `If-Match`, le corps gagne.
- **En-têtes de version** : chaque `POST`, `GET /:id` et `PATCH` publie `ETag: "<version>"` ; `POST` renvoie aussi `Location: /api/v1/tasks/:id`. Le client renvoie l'`ETag` tel quel dans `If-Match`, sans relire `version` dans le corps.
- **Statut en cas de version obsolète** — la tâche n'est jamais modifiée :

| Provenance de la version | Statut HTTP | `code` | `title` |
|---|---|---|---|
| corps (`version`) ou query (`?version=`) | `409 Conflict` | `CONFLICT_VERSION` | `Conflict` |
| en-tête `If-Match` | `412 Precondition Failed` | `CONFLICT_VERSION` | `Precondition Failed` |

  **Décision** : un `If-Match` non satisfait n'est pas un conflit de ressource mais une **précondition HTTP échouée** (RFC 9110 §13.1.1) → `412`. Une version passée dans le corps ou la query n'est pas une précondition (ce n'est pas un ETag) : c'est un conflit applicatif → `409`. Le **code métier reste `CONFLICT_VERSION`** dans les deux cas, pour que le client n'ait qu'une seule branche de traitement des conflits ; seul le statut distingue le mécanisme. Le filtre `problem+json` mappe donc `409` **et** `412` sur `CONFLICT_VERSION`.
- **Cloisonnement (N-3/N-7)** : toute lecture et toute mutation sont scopées par le workspace de la session, jamais par le corps ou la query. Le repository détient un `StoredTask` (entité + `workspaceId`) et ne rend que `Task`, dont le workspace est **absent du contrat public** : une fuite devient une erreur de compilation. Une tâche d'un autre workspace est indistinguable d'une tâche absente — `404`, jamais `403`, et le `404` prime sur le `409` même avec une version obsolète. Couvert par `tasks.security.spec.ts` (tests négatifs exigés par AGENTS §8).
- **Repository en mémoire** (`InMemoryTaskRepository`) : aucune persistance, données perdues au redémarrage, suppression physique. Il implémente le port `TaskRepository` ; passer à Prisma ne changera que le `useClass` du module (et introduira la suppression logique et la transaction du `SyncChange`).

Tests : `tasks.service.spec.ts` (cas métier, pagination, erreurs), `tasks.http.spec.ts` et `tasks.mutations.http.spec.ts` (vraie application Nest + Fastify sur un port éphémère, jetons réels, réponses validées par les schémas du contrat : états vide, contenu, erreurs 400/404/409/412, pagination) et `tasks.auth.http.spec.ts` (401 sans jeton, schéma non Bearer, signature étrangère, jeton expiré, claim manquant, `workspaceId` injecté dans le corps ignoré, lecture et mutation refusées entre deux workspaces, sondes publiques).

---

## 3. Structure du monorepo et commandes

### 3.1 Espaces de travail

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

#### 3.1.1 Paquets du monorepo (état réel)

| Paquet | Rôle | Build |
|---|---|---|
| `@focus/contracts` | schémas Zod, types inférés, codes d'erreur, `problem+json` | `tsc` → `dist/` (consommé par Node) |
| `@focus/config` | presets ESLint, Prettier, `tsconfig` Node et React | — |
| `@focus/design-tokens` | `src/tokens.ts` (couleurs, espacements, rayons, typographie, mouvement) et `src/theme.ts` | aucun : consommé **en source**, Metro transpile le TypeScript des paquets du workspace |
| `@focus/ui` | primitives React Native (`Screen`, `AppText`, `useFocusTheme`) | aucun : même raison |

Les valeurs de tokens sont celles du doc 01 §7.5 ; les neutres de texte, non listés par ce document, sont choisis pour tenir le contraste AA. Le mode clair/sombre suit le réglage système (`useColorScheme`), sans store ni préférence persistée. `packages/design-tokens/src/tokens.spec.ts` vérifie le contraste ≥ 4,5:1 du texte sur les deux surfaces, l'échelle 4 px strictement croissante, les six tailles de texte maximum et l'interlignage ≥ 1,4 (doc 04 §11.2). Aucune couleur littérale ne doit apparaître dans un écran : la règle est tenue par `@focus/ui`.

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
| `pnpm api:openapi` | `apps/api` | **existe** — génère `apps/api/openapi.json` depuis les schémas de `@focus/contracts` |
| `pnpm api:openapi:check` | `apps/api` | **existe** — échoue si `openapi.json` a dérivé des schémas (utilisé en CI) |
| `pnpm api:token` | `apps/api` | **existe** — signe un jeton d'accès local (`JWT_ACCESS_SECRET` requis) pour appeler l'API à la main |
| `pnpm test:integration` | `apps/api` | à venir — M1, avec Postgres éphémère (Docker) |
| `pnpm test:e2e:web` | racine | à venir — Playwright pas encore installé |
| `pnpm test:e2e:mobile` | racine | à venir — Maestro pas encore installé |
| `pnpm db:migrate` | `apps/api` | à venir — M1, avec Prisma |
| `pnpm db:deploy` | `apps/api` | à venir — M1, avec Prisma (CI/prod) |
| `pnpm db:seed` | `apps/api` | à venir — M1, avec Prisma |
| `pnpm db:reset` | `apps/api` | à venir — M1, avec Prisma (local uniquement) |
| `pnpm db:studio` | `apps/api` | à venir — M1, avec Prisma |
| `pnpm docker:up` / `docker:down` | racine | services locaux |
| `pnpm ios` / `pnpm android` | `apps/mobile` | build natif local |
| `pnpm desktop:dev` | `apps/desktop` | `tauri dev` (V1.1) |

Un script n'est déclaré dans `package.json` que s'il a une cible : un script racine qui pointe vers un script de paquet inexistant échoue au premier appel et donne l'illusion d'un outillage disponible. Les commandes marquées « à venir » ci-dessus sont donc **absentes** de `package.json` et seront ajoutées avec leur cible (Prisma pour `db:*`, Playwright pour `test:e2e:web`, Postgres éphémère pour `test:integration`).

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

**Sous-ensemble validé au démarrage (état réel).** `apps/api/src/config/env.schema.ts` valide, via Zod, les seules variables que l'API lit aujourd'hui : `NODE_ENV`, `PORT`, `API_PREFIX`, `CORS_ORIGINS`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `JWT_ISSUER`, `JWT_AUDIENCE`. Le chargement a lieu une fois, à la création de l'application (`AppConfigModule`) :

- une valeur invalide empêche le boot (fail-fast, R4) ; le message cite la variable et la règle, **jamais sa valeur** (S-5/S-12) ;
- `PORT` vide retombe sur `4000`, mais un `PORT` non numérique échoue (jamais de port arbitraire) ;
- `API_PREFIX` doit commencer par `/` et est réellement appliqué (`src/config/http.ts`, partagé par `main.ts` et les tests d'intégration) ; la valeur par défaut `/api/v1` est celle des chemins d'`openapi.json` — la changer impose de régénérer le contrat ;
- `CORS_ORIGINS` est découpé en liste et nettoyé des entrées vides ; aucune origine permissive n'est ajoutée par défaut.

Les autres lignes du tableau restent la cible : elles seront ajoutées au schéma avec le module qui les consomme (Prisma, Redis, stockage, e-mail, observabilité), et deviendront obligatoires à ce moment-là. `APP_ORIGIN`, `JWT_REFRESH_TTL`, `ARGON2_*` et `DATABASE_URL`/`REDIS_URL` ne sont donc pas encore validés.

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
pnpm api:openapi        # écrit apps/api/openapi.json (le fichier est commité)
pnpm api:openapi:check  # échoue si le fichier commité ne correspond plus aux schémas
```

**Chaîne de génération.** `apps/api/scripts/generate-openapi.cjs` convertit les schémas Zod de `@focus/contracts` (seule source, R2/R6) avec `zod-to-json-schema` (seule dépendance ajoutée : réécrire les schémas à la main dans l'OpenAPI recréerait la dérive que ce contrôle existe pour détecter). Les schémas imbriqués sont inlinés (`$refStrategy: "none"`) : chaque composant publié est autonome, sans `$ref` vers un sous-chemin d'un autre composant, et il n'y a donc aucun `#/definitions/*` à réécrire. Un contrôle interne vérifie ensuite que **chaque `$ref` pointe sur un composant émis** — une référence cassée fait échouer la génération au lieu de produire un document invalide.

**Part écrite à la main : la table des routes.** Aucun schéma Zod ne porte de métadonnée HTTP (méthode, chemin, statuts, en-têtes) : `paths` est donc décrit explicitement dans le script. Toute nouvelle route doit y être ajoutée ; les schémas, eux, ne sont jamais dupliqués. Document en **OpenAPI 3.1** (JSON Schema 2020-12, donc `anyOf` + `type: "null"` pour les champs nullables, sans traduction `nullable`).

**Détection de dérive.** `openapi.json` est **commité** : la CI exécute `pnpm api:openapi:check`, qui régénère le document en mémoire et le compare octet pour octet au fichier versionné. Toute divergence échoue avec la première ligne fautive, ce qui rend impossible un contrat modifié sans que le fichier suive.

**Pas encore de Swagger UI** : `@nestjs/swagger` n'est pas installé et `http://localhost:4000/docs` ne sert rien aujourd'hui. Le contrat publiable est le fichier généré ; l'UI interactive viendra avec la première route authentifiée, si elle apporte quelque chose.

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

**État implémenté (2026-11-25).** Seul le maillon de **vérification** existe : `AuthGuard` global (`apps/api/src/modules/auth/`), jeton d'accès JWT, contexte `{ userId, workspaceId }` issu des claims, `401` typés. Le flux ci-dessus reste la cible : `POST /auth/login`, `POST /auth/refresh`, la table `Session` et Argon2id ne sont pas écrits — ils dépendent de Prisma et d'un stockage utilisateur. Conséquence assumée : aucun jeton ne peut être obtenu depuis l'API ; en développement, `pnpm api:token` en signe un hors ligne. `errorCodeSchema` contient en revanche `SESSION_EXPIRED`, déjà renvoyé sur un jeton expiré.

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

Le client réel vit dans `apps/mobile/src/data/http/client.ts` : il injecte le jeton du store de session, valide chaque réponse avec le schéma `@focus/contracts` et normalise les erreurs en `AppError` (clé i18n). La file de rafraîchissement viendra avec l'endpoint `/auth/refresh`.

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

L'export n'aboutit que si le mode de résolution de §2.2 est respecté (`node-linker=hoisted`) et si `query-string` est déclaré par l'app (§2.2.1) : sinon Metro échoue sur les dépendances internes d'`expo-router`. La sortie `web.output: "static"` génère une page HTML par route (`index.html`, `_sitemap.html`, `+not-found.html`) et un bundle unique dans `_expo/static/js/web/`.

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
pnpm test                                   # unitaires + intégration HTTP (tout le monorepo)
pnpm --filter @focus/api test:watch         # watch sur l'API
```

Les commandes suivantes arriveront avec leur cible : `test:integration` exige un Postgres éphémère (M1, Docker), `test:e2e:web` Playwright, `test:e2e:mobile` Maestro. Elles ne sont volontairement pas déclarées dans `package.json` tant qu'elles échoueraient (voir §3.2). Les tests HTTP de `tasks.http.spec.ts` et `tasks.mutations.http.spec.ts` démarrent la vraie application Nest sur un port éphémère : ils couvrent déjà le transport sans base de données.

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
| `ERR_PNPM_UNSUPPORTED_ENGINE` sur toute commande | Node hors `>=22.12 <23` avec `engine-strict=true` | `nvm use 22` ; ne pas désactiver `engine-strict` durablement |
| `Unable to resolve module …` pendant `expo export` / `expo start` | layout pnpm isolé (`node-linker` absent de `.npmrc`) ou `query-string` non déclaré | appliquer §2.2 et §2.2.1, supprimer `node_modules`, réinstaller |
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
| `.npmrc` | `engine-strict=true`, `node-linker=hoisted` (**requis** par Expo SDK 52 — voir §2.2) |
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
