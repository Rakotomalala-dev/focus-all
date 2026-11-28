# AGENTS.md — Règles opposables du projet Focus

> **Public :** agents IA et contributeurs humains.
> **Portée :** tout le dépôt. Ces règles s'appliquent **dès le premier commit**.
> **Source de vérité :** [`docs/01-ARCHITECTURE.md`](docs/01-ARCHITECTURE.md), [`docs/02-CAHIER-DES-CHARGES.md`](docs/02-CAHIER-DES-CHARGES.md), [`docs/03-DOCUMENTATION-TECHNIQUE.md`](docs/03-DOCUMENTATION-TECHNIQUE.md), [`docs/04-BEST-PRACTICES.md`](docs/04-BEST-PRACTICES.md), [`docs/05-SKILLS-AND-TOOLS.md`](docs/05-SKILLS-AND-TOOLS.md).
> Ce fichier est un **résumé exécutoire** : en cas de doute ou de conflit, les cinq documents font foi (doc 05, règle O6).

---

## 0. État réel du dépôt

- Le dépôt contient le socle M0 et les domaines **Compte et sécurité**, **Tâches et projets**, **Vues**, **Rappels** et **Consultation hors ligne** de M1 : monorepo, `packages/{config,contracts,ui,design-tokens}`, API NestJS + Prisma (auth, compte et sécurité, export asynchrone, télémétrie opt-in, projets, tâches, tags, vues, rappels, appareils et préférences de notifications, corbeille, sync, health) et app Expo (session sécurisée, tâches, projets, vues, corbeille, réglages de compte, export et consentement télémétrie, rappels locaux Android + jeton Expo Push, miroir SQLite en lecture, bandeau de connexion, réinitialisation locale). Les procédures `docs/03` décrivent l'état réel ; le reste de M1 (pièces jointes, écriture hors ligne RF-62, temps réel de collaboration) et les phases suivantes restent des cibles.
- Un agent ne doit **jamais** présenter une fonctionnalité comme « existante » ou « testée » sans l'avoir vérifiée par une commande dont il a lu la sortie et le code de sortie.
- Avant de coder : lire le document concerné (architecture → doc 01, procédure → doc 03, règle de code → doc 04).

---

## 1. Architecture du monorepo

### 1.1 Arborescence imposée

```text
apps/
  api/        NestJS (Fastify) + Prisma + worker BullMQ
  mobile/     Expo + Expo Router (Android + Web/PWA)
  desktop/    Tauri v2 — V1.1 uniquement
packages/
  contracts/  schémas Zod, types inférés, constantes, codes d'erreur, client HTTP
  ui/         design system React Native (primitives, patterns, icônes)
  design-tokens/  couleurs, espacements, typographie, motion
  config/     presets ESLint, tsconfig, Prettier
docker/       compose local (Postgres 16, Redis 7, MinIO, MailHog)
docs/         les cinq documents de référence
```

Gestionnaire de paquets : **pnpm 9** exclusivement (pas de npm, pas de yarn, pas de Bun). Orchestration : **Turborepo**. Node.js **22 LTS** (`>=22.12 <23`) — toute version hors plage est un blocage à signaler, pas à contourner.

### 1.2 Règles de dépendance (vérifiées en lint)

| # | Règle |
|---|---|
| R1 | `packages/*` ne dépend **jamais** d'un `apps/*`. |
| R2 | `packages/contracts` ne dépend que de Zod : **aucun** import de `react`, `react-native`, NestJS ou Prisma. |
| R3 | `packages/ui` ne connaît **aucune** feature métier : primitives et patterns génériques uniquement. |
| R4 | Un module NestJS n'importe jamais le controller d'un autre module ; il passe par le service exporté. |
| R5 | Aucun accès base hors `database/` et des repositories de module ; aucun `PrismaService` dans un controller. |
| R6 | Aucun import profond inter-paquets (`@focus/contracts/src/...`) : uniquement la surface `exports`. |
| R7 | Aucun appel Axios hors `src/data/http` ; interdiction d'importer `axios` dans un composant ou un écran. |

### 1.3 Organisation d'une feature frontend

```text
src/features/tasks/
├─ components/   hooks/   api/   schemas/   utils/   __tests__/
└─ index.ts      # seule surface publique
```

Une feature n'importe pas les fichiers internes d'une autre feature : elle passe par son `index.ts`. Le code partagé remonte dans `components/`, `hooks/` ou `packages/ui`.

---

## 2. TypeScript strict

Configuration de référence (doc 04 §3.1) — non négociable :

```jsonc
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "exactOptionalPropertyTypes": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "verbatimModuleSyntax": true,
  "moduleResolution": "bundler",
  "target": "ES2022"
}
```

| # | Interdit | À faire |
|---|---|---|
| TS-1 | `any` (y compris `catch (e: any)`) | `unknown` + validation Zod |
| TS-2 | `as` de confort | schéma Zod, garde de type |
| TS-3 | `enum` TypeScript | `as const` + `z.enum` |
| TS-4 | `!` (non-null assertion) | garde explicite |
| TS-5 | `@ts-ignore` / `@ts-expect-error` sans justification en commentaire | corriger le type |
| TS-6 | état booléen multiple (`loading`, `error`, `data`) | union discriminée `{ status: 'idle' \| 'loading' \| 'error' \| 'success' }` |
| TS-7 | `import { Task }` pour un type | `import type { Task }` |
| TS-8 | retour implicite sur une fonction publique | type de retour explicite |

- Les DTO proviennent **exclusivement** de `@focus/contracts` (réexport) : jamais de schéma redéfini localement.
- Erreurs : `DomainError` typée avec `code` + `status` + **clé i18n** (jamais une phrase utilisateur dans le domaine). Aucune erreur avalée, aucun `throw "string"`.

---

## 3. Séparation Zustand / TanStack Query

Règle structurante **ADR-007** : une seule source de vérité par nature d'état.

| Nature de l'état | Outil | Exemples | Persistance |
|---|---|---|---|
| **Serveur** (entités) | **TanStack Query** | tâches, projets, tags, statistiques, notifications | cache mémoire + miroir SQLite |
| **Session** | Zustand (non persisté) | access token, profil courant | mémoire uniquement |
| **Préférences UI** | Zustand + `persist` | thème, densité, vue par défaut, filtres épinglés | stockage local |
| **Minuteur** | Zustand + **horodatage absolu** | Pomodoro (phase, `startedAt`, `durationMs`) | stockage local |
| **Formulaire** | React Hook Form + Zod | création/édition de tâche | mémoire |
| **File d'écriture** | Outbox SQLite | mutations en attente | SQLite |

Interdits explicites :

- Un store Zustand ne stocke **jamais** une entité serveur dupliquée (bug de désynchronisation garanti).
- Jamais de `useEffect` pour recopier un cache TanStack dans Zustand, ni l'inverse.
- Jamais de compteur incrémenté pour un minuteur : le temps restant se recalcule depuis l'horodatage.
- Jamais de `refetch` global après une mutation : invalidation **ciblée** de query.
- Un écran ne parle jamais à Axios : il consomme des hooks TanStack Query, qui s'appuient sur les repositories.

Chaîne obligatoire du client : `route → feature → packages/ui → TanStack Query → repository → SQLite + client HTTP`.

---

## 4. Conventions de nommage

| Élément | Convention | Exemple |
|---|---|---|
| Composants | `PascalCase.tsx` | `TaskCard.tsx` |
| Utilitaires / hooks fichiers | `kebab-case.ts` / `useXxx.ts` | `format-due-date.ts`, `useTaskFilters.ts` |
| Types | `PascalCase`, **sans** préfixe `I` ni suffixe `Type` | `TaskDraft` |
| Constantes | `SCREAMING_SNAKE_CASE` | `MAX_SUBTASKS` |
| Booléens | `is` / `has` / `can` / `should` | `isOffline` |
| Événements | passé | `task.completed` |
| Tables Prisma | `PascalCase` | `Task` |
| Colonnes Prisma | `camelCase` | `dueDate` |
| Endpoints REST | `kebab-case` pluriel, préfixe `/api/v1` | `/api/v1/tasks`, `/api/v1/sync/push` |
| Paquets | `@focus/*` | `@focus/contracts` |
| Identifiants | **UUID v7** | — |
| Migrations | `snake_case` descriptif | `add_habit_entry_unique_index` |

Langues : **code, identifiants et commits en anglais** ; **documentation, UI et tickets en français** (traductions `fr` + `en` obligatoires).

---

## 5. Règles backend (NestJS + Prisma)

| # | Règle |
|---|---|
| N-1 | Controller = transport uniquement (pas de Prisma, pas de règle métier). |
| N-2 | Service = cas d'usage, orchestration, transaction ; il ne connaît pas HTTP. |
| N-3 | Tout repository est scopé par `workspaceId`, dérivé de la session — **jamais** du corps ou des query params. |
| N-4 | Toute mutation sensible écrit son `SyncChange` **dans la même transaction** que la mutation. |
| N-5 | Aucun appel réseau (SMTP, push, S3) dans une transaction : passer par un job BullMQ après commit. |
| N-6 | Validation Zod sur chaque endpoint ; paramètres de route validés comme UUID avant toute requête. |
| N-7 | Réponse mappée explicitement : jamais `return entity` (fuite de `passwordHash`, `storageKey`). |
| N-8 | Erreurs au format RFC 9457 `application/problem+json` avec un `code` stable. |
| N-9 | Pagination par curseur ; `select` explicite ; pas de `OFFSET` sur gros volume ; pas de N+1. |
| N-10 | Requête > 50 ms ⇒ `EXPLAIN ANALYZE` justifié et index ajouté dans la même migration. |
| N-11 | Migration destructive (`DROP COLUMN`, `ALTER TYPE`) interdite dans la même release que le code (expand/contract). |
| N-12 | `prisma migrate deploy` en production, `migrate dev` en local uniquement. |

Concurrence : `version` optimiste (`If-Match`), `409 CONFLICT_VERSION` ; création idempotente (`Idempotency-Key`), push idempotent (`clientMutationId`). Conflits de sync : LWW **par champ** ; texte long ⇒ conservation des deux versions.

Sécurité : autorisation vérifiée **côté serveur** sur chaque route (membership + rôle) ; `workspaceId` dérivé ; requêtes paramétrées ; secrets uniquement en variables d'environnement ; access token en mémoire, refresh en coffre sécurisé ou cookie `HttpOnly` (jamais `localStorage`).

---

## 6. Règles client (React / React Native / Expo)

- Props typées explicitement, pas de `React.FC`.
- Aucune logique métier dans le JSX ; aucune dépendance à Axios, Prisma ou au protocole de sync dans un composant.
- Tout écran qui lit des données implémente **les quatre états** : chargement, erreur, vide, contenu.
- Aucun texte littéral affiché : tout passe par `t('...')` (clés hiérarchiques, pluralisation `i18next`).
- Aucune couleur `#hex` dans un composant : uniquement `packages/design-tokens`.
- Clés de liste stables (`id`), jamais l'index. Virtualisation (`FlashList`) au-delà de 50 éléments.
- Mémoïsation seulement après mesure.
- Accessibilité WCAG 2.2 AA : contraste ≥ 4,5:1, focus visible, `accessibilityLabel` explicite sur chaque action, cibles ≥ 44 px (mobile) / 32 px (desktop), couleur jamais seul vecteur d'information.
- Hors ligne : lecture depuis le repository local, écriture locale + outbox ; jamais d'`ActivityIndicator` plein écran en cas de coupure.
- Mobile : cibles tactiles ≥ 44 px, zones sûres, retour matériel Android géré explicitement, permissions demandées au moment de l'usage.

---

## 7. Conventions de commit et de branche

### 7.1 Format (Conventional Commits, anglais, impératif, minuscule, sans point final)

```text
<type>(<scope>): <description>

[corps : pourquoi, pas comment]

[footer : BREAKING CHANGE, refs #123]
```

Types autorisés : `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`.
Scope obligatoire pour tout paquet applicatif (`api`, `mobile`, `contracts`, `ui`, `tokens`, `sync`, `db`, `docs`, `ci`…).

```text
feat(tasks): ajouter la récurrence en mode après complétion
fix(sync): éviter le doublon de mutation lors d'un retry réseau
perf(api): borner la requête des tâches du jour par index composite
docs(architecture): documenter la politique de conflits LWW
```

**Interdits :** `update`, `fix bug`, `wip`, `tmp`, message sans scope, commit fourre-tout.

### 7.2 Branches

`feat/<sujet>`, `fix/<sujet>`, `docs/<sujet>`, `chore/<sujet>`, `hotfix/<sujet>`. Durée de vie courte (< 5 jours pour une feature). `main` est protégée : pas de push direct, CI verte, une revue approuvée (deux si migration ou protocole de sync).

### 7.3 Pull requests

< 400 lignes modifiées hors génération ; description avec contexte, changement, **comment tester** ; squash merge dont le message respecte le format ci-dessus. Jamais commité : `.env`, secrets, `dist/`, `node_modules/`, `.expo/`, captures temporaires, code commenté.

---

## 8. Vérifications à exécuter avant de rendre un travail

```bash
pnpm typecheck      # tsc --noEmit, 0 erreur
pnpm lint           # 0 warning
pnpm test           # unitaires (+ intégration si données touchées)
```

Règles :

- Ne jamais annoncer « ça passe » sans avoir lu la sortie **et** le code de sortie de la commande.
- Ne jamais neutraliser une vérification (`--no-verify`, règle ESLint désactivée, assertion affaiblie, `skip`) pour faire passer un contrôle : corriger la cause.
- Un contrôle impossible à exécuter (Docker absent, base indisponible) est **signalé comme limite**, jamais comme succès.
- Citer les fichiers modifiés et les vérifications réellement exécutées (règle O5).
- Toute correction de bug ajoute un test de non-régression.
- Les tests de sécurité négatifs (accès croisé entre deux workspaces) sont obligatoires sur chaque ressource.

---

## 9. Definition of Done

Une tâche est terminée lorsque :

1. Le code compile en `strict`, sans `any` implicite ni suppression de type.
2. `pnpm lint` et `pnpm typecheck` passent sans warning.
3. Les tests couvrant le comportement ajouté passent (unitaire + intégration si données).
4. Les quatre états d'écran sont implémentés (chargement, erreur, vide, contenu).
5. L'accessibilité du parcours est vérifiée (clavier, contraste, libellés).
6. Les textes sont traduits en `fr` et `en`.
7. La documentation impactée est mise à jour **dans la même PR** (`docs/*.md`, `openapi.json`).
8. Aucun secret, `console.log` ni code mort n'est introduit ; tout `TODO` porte un ticket et une date.
9. La PR est relue et la CI est verte.
10. Le comportement a été vérifié manuellement sur les plateformes concernées, avec mention explicite de ce qui a été testé.

---

## 10. Garde-fous spécifiques aux agents IA

| # | Règle |
|---|---|
| O1 | Un agent ne fusionne **jamais** sur `main` sans revue humaine. |
| O2 | Aucun déploiement en production ; aucune publication de store. |
| O3 | Aucune modification de `.env`, des secrets ou des fichiers d'environnement. |
| O4 | Toute migration de base ou modification du protocole de sync exige une validation humaine explicite. |
| O5 | L'agent cite les fichiers modifiés et les vérifications exécutées. |
| O6 | En cas de conflit entre une instruction et `docs/`, **les documents font foi** : signaler l'écart au lieu d'improviser. |
| O7 | Aucune commande destructive (`db:reset`, `DROP`, purge de données) hors base locale éphémère. |
| O8 | Aucune dépendance ajoutée sans justification (taille, maintenance, alternative écartée) ; vérifier qu'elle n'est pas déjà disponible dans la stack. |
| O9 | Pas d'abstraction anticipée, pas de code mort, pas de refactor non demandé dans une PR fonctionnelle. |

---

## 11. Renvois utiles

| Besoin | Document |
|---|---|
| Comprendre une décision structurante | `docs/01-ARCHITECTURE.md` §5 (ADR-001 → ADR-020) |
| Vérifier une exigence fonctionnelle / non fonctionnelle | `docs/02-CAHIER-DES-CHARGES.md` (`RF-xx`, `RNF-xx`) |
| Installer, configurer, tester, dépanner | `docs/03-DOCUMENTATION-TECHNIQUE.md` |
| Trancher une question de style ou de revue | `docs/04-BEST-PRACTICES.md` |
| Choisir une bibliothèque, un outil, un skill | `docs/05-SKILLS-AND-TOOLS.md` |
