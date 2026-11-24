# 04 — Bonnes pratiques de développement

> **Projet :** Focus
> **Statut :** v1.0 — règles opposables en revue de code
> **Public :** tous les contributeurs (humains et agents IA)
> **Documents liés :** [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) · [02-CAHIER-DES-CHARGES.md](./02-CAHIER-DES-CHARGES.md) · [03-DOCUMENTATION-TECHNIQUE.md](./03-DOCUMENTATION-TECHNIQUE.md) · [05-SKILLS-AND-TOOLS.md](./05-SKILLS-AND-TOOLS.md)

---

## 1. Philosophie de travail

| Principe | Signification concrète |
|---|---|
| **Le code est lu 10 fois plus qu'il n'est écrit** | Optimiser pour la lisibilité : noms explicites, fonctions courtes, pas de « clever code » |
| **Petites unités, frontières nettes** | Une fonction = une responsabilité ; un module = un domaine ; un composant = une intention visuelle |
| **Explicite plutôt qu'implicite** | Pas de magie, pas de side-effect caché, pas de mutation partagée |
| **Le type est une documentation exécutable** | Si le compilateur ne peut pas le vérifier, un test doit le faire |
| **Les erreurs sont des données** | Toute erreur a un code stable et un traitement défini |
| **Mesurer avant d'optimiser** | Aucune optimisation sans mesure reproductible |
| **La dette est datée** | Un `TODO` sans ticket et sans date est refusé en revue |

### 1.1 Règle des trois « non »

1. **Non** au code mort : rien de commenté « au cas où » (Git s'en souvient).
2. **Non** aux abstractions anticipées : on factorise à la troisième occurrence, pas à la première.
3. **Non** aux dépendances non justifiées : chaque paquet ajouté doit être justifié en revue (taille, maintenance, alternatives).

---

## 2. Architecture et organisation du code

### 2.1 Règles de dépendance (rappel doc 01 §6.2)

| Règle | Vérification |
|---|---|
| `packages/*` n'importe jamais `apps/*` | règle ESLint `no-restricted-imports` |
| Aucun import profond inter-paquets (`@focus/contracts/src/...`) | `package.json#exports` + règle ESLint |
| Un module NestJS n'importe pas le controller d'un autre module | revue + lint `boundaries` |
| Aucun accès Prisma hors repository | règle ESLint sur `PrismaService` |
| Aucun appel Axios hors `src/data/http` | règle ESLint `no-restricted-imports` sur `axios` |

### 2.2 Organisation d'une feature frontend

```text
src/features/tasks/
├─ components/          # TaskCard, TaskListRow, TaskDetailSheet
├─ hooks/               # useTasks, useCompleteTask, useTaskFilters
├─ api/                 # queries + mutations TanStack (appellent les repositories)
├─ schemas/             # formulaires (Zod) dérivés de @focus/contracts
├─ utils/               # fonctions pures testables (tri, groupement, formatage)
├─ __tests__/
└─ index.ts             # surface publique de la feature
```

Une feature **n'importe pas** les fichiers internes d'une autre feature ; elle passe par son `index.ts`. Si deux features ont besoin du même code, ce code remonte dans `components/`, `hooks/` partagés ou `packages/ui`.

### 2.3 Nommage

| Élément | Convention | Exemple |
|---|---|---|
| Fichiers de composants | `PascalCase.tsx` | `TaskCard.tsx` |
| Fichiers utilitaires | `kebab-case.ts` | `format-due-date.ts` |
| Hooks | `useXxx.ts` + export `useXxx` | `useTaskFilters` |
| Types / interfaces | `PascalCase`, pas de préfixe `I` | `TaskDraft`, `SyncResult` |
| Constantes | `SCREAMING_SNAKE_CASE` | `MAX_SUBTASKS` |
| Booléens | `is/has/can/should` | `isOffline`, `canEdit` |
| Fonctions asynchrones | verbe à l'infinitif | `completeTask`, `pullChanges` |
| Événements | passé (ce qui s'est produit) | `task.completed` |
| Tables / colonnes | voir doc 01 §19.2 | `Task`, `dueDate` |

**Interdits** : abréviations non universelles (`usr`, `pjt`), noms génériques (`data`, `item`, `temp`, `handle`), suffixes redondants (`TaskType`, `TaskInterface`).

---

## 3. TypeScript

### 3.1 Configuration de référence

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022"]
  }
}
```

### 3.2 Règles

| # | Règle | Contre-exemple | Bonne pratique |
|---|---|---|---|
| TS-1 | `any` interdit (sauf frontière documentée avec `unknown` + garde) | `const res: any = await api()` | `const res: unknown = ...` puis `schema.parse(res)` |
| TS-2 | `as` réservé aux cas prouvés | `payload as Task` | validation Zod |
| TS-3 | Préférer `type` pour les unions, `interface` pour les objets extensibles | — | cohérence par fichier |
| TS-4 | Unions discriminées pour les états | `{ loading: boolean; error?: string }` | `{ status: 'idle' } \| { status: 'loading' } \| { status: 'error'; error: AppError }` |
| TS-5 | Pas d'énumération TypeScript (`enum`) | `enum Status { TODO }` | `const TASK_STATUS = ['TODO', ...] as const` + `z.enum` |
| TS-6 | `readonly` sur les structures partagées | mutation accidentelle du cache | `readonly Task[]` |
| TS-7 | Retour explicite sur les fonctions publiques | inférence fragile sur les API | `function foo(): Promise<Task>` |
| TS-8 | Pas de non-null assertion `!` | `task!.id` | garde explicite |
| TS-9 | `satisfies` pour valider sans élargir | `const config: Config = {...}` | `const config = {...} satisfies Config` |
| TS-10 | Imports de types explicites | `import { Task }` | `import type { Task }` |

### 3.3 Gestion des erreurs

```ts
// Domaine : clé + paramètres typés ; `code` et `status` viennent d'un catalogue
// indexé par la clé, pour qu'un même cas ne sorte pas avec deux statuts.
export class DomainError<K extends DomainErrorKey = DomainErrorKey> extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  constructor(
    readonly messageKey: K,
    readonly params?: DomainErrorParams[K],
  ) {
    super(messageKey); // `message` sert aux logs, jamais à l'utilisateur
    this.name = "DomainError";
    // … `code` et `status` lus dans le catalogue indexé par `messageKey`
  }
}

// Service : on lève du domaine, on ne construit pas de réponse HTTP
if (task.version !== input.baseVersion) {
  throw new DomainError("task.version_mismatch", { currentVersion: task.version });
}

// Controller : la traduction HTTP est centralisée dans un filtre
```

| Interdit | Raison |
|---|---|
| `catch (e) { console.log(e) }` | erreur avalée, aucune trace exploitable |
| `throw "erreur"` | pas de pile, pas de code |
| `catch (e: any)` | contourne le typage |
| Message d'erreur destiné à l'utilisateur dans le domaine | viole l'i18n ; utiliser une **clé** |

---

## 4. React (web + React Native)

### 4.1 Règles de composants

| # | Règle |
|---|---|
| RC-1 | Un composant = une intention ; au-delà de ~150 lignes de JSX, découper |
| RC-2 | Props typées explicitement, pas de `React.FC` (il masque les génériques et ajoute `children` implicitement) |
| RC-3 | Aucune logique métier dans le JSX : extraire dans un hook ou une fonction pure |
| RC-4 | Pas de `useEffect` pour dériver un état calculable (utiliser `useMemo` ou calcul direct) |
| RC-5 | Les `useEffect` ont un tableau de dépendances exact et une fonction de nettoyage si abonnement |
| RC-6 | Clés de liste stables (`id`), jamais l'index |
| RC-7 | Mémoïsation seulement après mesure (`React.memo`, `useCallback` ne sont pas des réflexes) |
| RC-8 | Un composant ne connaît ni Axios, ni Prisma, ni le protocole de sync |
| RC-9 | Les textes passent par `t('...')` ; jamais de chaîne littérale affichée |
| RC-10 | Les couleurs viennent des tokens ; jamais de `#hex` dans un composant |

### 4.2 Exemple de référence

```tsx
// features/tasks/components/task-card.tsx
type TaskCardProps = {
  task: Task;
  onToggle: (taskId: string) => void;
  onOpen: (taskId: string) => void;
};

export function TaskCard({ task, onToggle, onOpen }: TaskCardProps) {
  const { t } = useTranslation();
  const dueLabel = useDueDateLabel(task.dueDate, task.dueTime, task.timezone);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("task.card.a11y", { title: task.title, due: dueLabel })}
      onPress={() => onOpen(task.id)}
      style={styles.container}
    >
      <Checkbox
        checked={task.status === "DONE"}
        onChange={() => onToggle(task.id)}
        accessibilityLabel={t("task.card.toggle", { title: task.title })}
      />
      <View style={styles.content}>
        <Text numberOfLines={2} style={styles.title}>{task.title}</Text>
        {dueLabel ? <Text style={styles.due}>{dueLabel}</Text> : null}
      </View>
      <PriorityBadge priority={task.priority} />
    </Pressable>
  );
}
```

### 4.3 Performance React

| Situation | Action |
|---|---|
| Liste > 50 éléments | `FlashList` avec `estimatedItemSize` |
| Rendu coûteux d'un item | `React.memo` + props stables (mesuré avant) |
| Calcul dérivé lourd | `useMemo` |
| Callback passé à une liste | `useCallback` seulement si le memo enfant en dépend |
| Re-render global | sélecteurs Zustand granulaires (`useStore(s => s.x)`), jamais l'objet entier |
| Images | `expo-image`, `cachePolicy="memory-disk"`, dimensions explicites |

---

## 5. React Native / Expo

### 5.1 Spécificités

| # | Règle |
|---|---|
| RN-1 | Tester sur un appareil réel avant toute validation d'une feature tactile (l'émulateur ment sur les performances) |
| RN-2 | Utiliser les primitives du design system (`packages/ui`), pas `View`/`Text` bruts dans les features |
| RN-3 | `StyleSheet.create` ou tokens ; pas d'objet de style inline recréé à chaque rendu |
| RN-4 | Respecter les zones sûres (`SafeAreaView` / `useSafeAreaInsets`) et la barre de navigation Android |
| RN-5 | Cibles tactiles ≥ 44 × 44 px, espacement ≥ 8 px |
| RN-6 | Pas de `console.log` en production (`babel-plugin-transform-remove-console` en build release) |
| RN-7 | Les timers s'appuient sur un horodatage absolu, jamais sur un compteur incrémenté |
| RN-8 | Toute permission (notifications, stockage) est demandée **au moment de l'usage**, avec explication préalable |
| RN-9 | Les deep links sont testés (`focus://task/:id`) sur cold start et warm start |
| RN-10 | Le retour matériel Android est géré explicitement (`BackHandler`) sur les écrans modaux |

### 5.2 Structure d'écran type

```tsx
export default function TodayScreen() {
  const { data, isLoading, isError, refetch } = useTodayTasks();

  if (isLoading) return <TodaySkeleton />;
  if (isError) return <ErrorState onRetry={refetch} />;
  if (!data?.length) return <EmptyState variant="today" />;

  return (
    <Screen scroll>
      <TodaySummary counts={data.counts} loadMinutes={data.loadMinutes} />
      <TaskSection title={t("today.overdue")} tasks={data.overdue} tone="danger" />
      <TaskSection title={t("today.due")} tasks={data.due} />
      <CollapsibleSection title={t("today.done")} count={data.completed.length}>
        <TaskList tasks={data.completed} variant="completed" />
      </CollapsibleSection>
    </Screen>
  );
}
```

**Règle des quatre états** : tout écran qui lit des données implémente **chargement, erreur, vide, contenu**. Un écran sans état vide est incomplet.

### 5.3 Mode hors ligne

- Toute lecture passe par le repository local ; le réseau est une optimisation, pas une condition.
- Toute écriture écrit localement **puis** met en file une mutation ; l'UI ne dépend jamais de la réponse serveur pour se mettre à jour.
- Le bandeau d'état réseau est global et non bloquant.
- Aucun `ActivityIndicator` plein écran en cas de coupure : afficher les données locales avec un indicateur discret.

---

## 6. NestJS

### 6.1 Règles de structure

| # | Règle |
|---|---|
| N-1 | Controller = transport uniquement : pas de Prisma, pas de règle métier, pas de calcul |
| N-2 | Service = cas d'usage, transactions, orchestration ; il ne connaît pas HTTP |
| N-3 | Repository = accès données, toujours scopé par `workspaceId` |
| N-4 | Les DTO viennent de `@focus/contracts` (réexport), jamais redéfinis localement |
| N-5 | Injection par constructeur, dépendances en `private readonly` |
| N-6 | Pas de `forwardRef` sauf cycle réel justifié en commentaire |
| N-7 | Toute mutation sensible écrit un `SyncChange` **dans la même transaction** que la mutation |
| N-8 | Les guards appliquent l'autorisation ; les services ne re-vérifient pas les rôles (sauf policy métier) |
| N-9 | Aucun `try/catch` autour d'un appel Prisma pour « logger et retenter » : laisser remonter, traiter au niveau du filtre |
| N-10 | Un module n'expose que ce dont les autres ont besoin (`exports` minimal) |

### 6.2 Exemple de service conforme

```ts
@Injectable()
export class TasksService {
  constructor(
    private readonly tasks: TasksRepository,
    private readonly sync: SyncService,
    private readonly events: EventEmitter2,
  ) {}

  async complete(ctx: AuthContext, taskId: string, baseVersion?: number): Promise<Task> {
    return this.tasks.transaction(async (tx) => {
      const task = await this.tasks.findByIdForUpdate(tx, ctx.workspaceId, taskId);
      if (!task) throw new DomainError("NOT_FOUND", 404, "task.not_found");
      if (baseVersion !== undefined && task.version !== baseVersion) {
        throw new DomainError("CONFLICT_VERSION", 409, "task.version_mismatch");
      }
      if (task.status === "DONE") return task; // idempotent

      const updated = await this.tasks.update(tx, task.id, {
        status: "DONE",
        completedAt: new Date(),
        version: { increment: 1 },
      });

      await this.sync.record(tx, {
        workspaceId: ctx.workspaceId,
        entityType: "task",
        entityId: task.id,
        operation: "UPSERT",
        version: updated.version,
        actorId: ctx.userId,
      });

      this.events.emit("task.completed", { taskId: task.id, workspaceId: ctx.workspaceId });
      return updated;
    });
  }
}
```

### 6.3 Validation

- Un schéma Zod par endpoint, exporté dans `contracts`, utilisé côté serveur **et** client.
- `ZodValidationPipe` global, `whitelist` implicite (les clés inconnues sont supprimées, pas ignorées silencieusement).
- Les paramètres de route (`:id`) sont validés comme des UUID avant toute requête base.
- Aucune donnée de contexte (`userId`, `workspaceId`, `role`) n'est lue depuis le corps ou les query params.

### 6.4 Transactions

| Cas | Transaction |
|---|---|
| Mutation d'une entité + `SyncChange` | obligatoire, même transaction |
| Complétion d'une tâche récurrente (compléter + créer l'occurrence suivante) | obligatoire |
| Création de tâche + tags + rappels | obligatoire |
| Envoi de notification | **hors** transaction, via job (après commit) |

Règle : jamais d'appel réseau (SMTP, push, S3) à l'intérieur d'une transaction.

---

## 7. Sécurité applicative

| # | Règle | Détail |
|---|---|---|
| S-1 | Autorisation côté serveur systématique | chaque requête vérifie le membership et le rôle ; l'UI n'est jamais une barrière |
| S-2 | `workspaceId` dérivé, jamais fourni | extrait de la ressource ou du contexte de session |
| S-3 | Requêtes paramétrées | Prisma ou `Prisma.sql` ; concaténation SQL interdite |
| S-4 | Validation en entrée **et** mapping explicite en sortie | jamais `return entity` (fuite de `passwordHash`, `storageKey`) |
| S-5 | Secrets uniquement par variables d'environnement | aucun secret dans le dépôt, les logs, les tests, les captures |
| S-6 | Tokens : accès en mémoire, refresh en coffre sécurisé / cookie HttpOnly | jamais `localStorage` pour un refresh |
| S-7 | Rate limiting sur auth et sync | quotas par IP et par utilisateur |
| S-8 | Uploads | type MIME réel vérifié, taille limitée, nom de fichier jamais réutilisé comme clé |
| S-9 | Rendu de contenu utilisateur | Markdown assaini, pas de HTML brut |
| S-10 | Dépendances | audit CI bloquant, pas de paquet non maintenu |
| S-11 | Erreurs en production | pas de pile ni de détail interne dans la réponse |
| S-12 | Journalisation | jamais de token, mot de passe, e-mail en clair |

### 7.1 Checklist sécurité d'une nouvelle route

1. Guard d'authentification présent ?
2. Guard de workspace présent avec rôle minimal ?
3. Schéma Zod d'entrée appliqué ?
4. La ressource est-elle bien rattachée au workspace courant (test négatif écrit) ?
5. Réponse mappée explicitement (pas d'entité brute) ?
6. Rate limit approprié si opération coûteuse ?
7. `SyncChange` écrit si mutation ?
8. Test d'accès croisé entre deux workspaces ajouté ?

---

## 8. Performance

| Domaine | Règle |
|---|---|
| API | `select` explicite, pagination par curseur, index vérifié, pas de N+1 (utiliser `include` ciblé ou `groupBy`) |
| Base | requête > 50 ms ⇒ `EXPLAIN ANALYZE` et justification ; index ajouté dans la même migration |
| Payload | réponses < 100 ko en liste ; champs lourds (description) exclus des listes |
| Client | virtualisation, images dimensionnées, pas de re-render global |
| Bundle | imports ciblés (`lodash-es/groupBy`), pas de barrel export massif dans les features |
| Sync | lots de 100 mutations, pull de 500 changements max |
| Mémoire | libérer les abonnements WebSocket au démontage, pas de cache non borné |

**Interdits** : `SELECT *` implicite (Prisma `findMany` sans `select` sur une table large), `OFFSET` sur des volumes importants, optimisation « au feeling » non mesurée.

### 8.1 Budgets (rappel doc 02 §7.1)

| Mesure | Seuil bloquant en CI |
|---|---|
| Lighthouse performance (web) | ≥ 85 |
| Lighthouse accessibilité | ≥ 95 |
| Taille du bundle initial web | ≤ 400 ko gzip |
| p95 API lectures (test de charge) | ≤ 200 ms |

---

## 9. Tests

### 9.1 Pyramide et responsabilités

| Niveau | Ce qu'on teste | Ce qu'on ne teste pas |
|---|---|---|
| Unitaire | fonctions pures, parseurs, RRULE, policies, reducers de sync | rendu de composants triviaux |
| Composant | interaction utilisateur sur un composant critique | styles pixel-perfect |
| Intégration | module + vraie base + vraies transactions | UI |
| E2E | parcours utilisateur complet | cas limites exhaustifs |
| Charge | endpoints critiques | logique métier |

### 9.2 Règles

| # | Règle |
|---|---|
| T-1 | Un test qui ne peut pas échouer n'a aucune valeur (vérifier l'assertion) |
| T-2 | Un test = un comportement ; nom en français explicite (`crée une occurrence le lundi suivant en mode date fixe`) |
| T-3 | Pas de test dépendant de l'ordre d'exécution ni de l'heure système réelle (injecter une horloge) |
| T-4 | Pas de `sleep` : attendre un état observable |
| T-5 | Chaque bug corrigé ajoute un test de non-régression |
| T-6 | Les tests d'intégration utilisent une base éphémère migrée, jamais la base de dev |
| T-7 | Les données de test sont construites par des factories, pas copiées-collées |
| T-8 | Un test lent (> 1 s) en unitaire est un signal : mauvaise frontière |
| T-9 | Les tests négatifs de sécurité (accès croisé) sont obligatoires sur chaque ressource |
| T-10 | Couverture : ≥ 80 % lignes sur `services`, `policies`, `sync`, `utils` (pas un objectif global) |

### 9.3 Exemple de test lisible

```ts
describe("récurrence — mode date fixe", () => {
  it("conserve le lundi comme jour d'occurrence même si la tâche est terminée un mercredi", () => {
    const next = nextOccurrence({
      rule: "FREQ=WEEKLY;BYDAY=MO",
      mode: "FIXED",
      dueDate: "2026-11-16",          // lundi
      completedAt: "2026-11-18",      // mercredi
      timezone: "Europe/Paris",
    });
    expect(next).toBe("2026-11-23");
  });
});
```

---

## 10. Git et collaboration

### 10.1 Branches

| Type | Nommage | Durée de vie |
|---|---|---|
| Fonctionnalité | `feat/tasks-recurrence` | < 5 jours |
| Correction | `fix/sync-cursor-410` | < 2 jours |
| Documentation | `docs/architecture-sync` | courte |
| Maintenance | `chore/upgrade-expo` | courte |
| Correctif urgent | `hotfix/session-revocation` | immédiate |

`main` est protégée : pas de push direct, une revue approuvée minimum, CI verte, branche à jour.

### 10.2 Conventional Commits

```text
<type>(<scope>): <description à l'impératif, minuscule, sans point final>

[corps optionnel : pourquoi, pas comment]

[footer : BREAKING CHANGE, refs #123]
```

| Type | Usage |
|---|---|
| `feat` | nouvelle capacité utilisateur |
| `fix` | correction de comportement |
| `refactor` | changement sans effet fonctionnel |
| `perf` | amélioration mesurée |
| `test` | ajout/modification de tests |
| `docs` | documentation seule |
| `build` / `ci` | outillage, dépendances, pipeline |
| `chore` | tâches diverses |

Exemples :

```text
feat(tasks): ajouter la récurrence en mode après complétion
fix(sync): éviter le doublon de mutation lors d'un retry réseau
perf(api): borner la requête des tâches du jour par index composite
docs(architecture): documenter la politique de conflits LWW
```

**Interdits** : `update`, `fix bug`, `wip`, `tmp`, messages sans scope sur les paquets applicatifs.

### 10.3 Pull requests

| Élément | Exigence |
|---|---|
| Taille | < 400 lignes modifiées hors génération ; au-delà, découper |
| Description | contexte, ce qui change, comment tester, captures si UI |
| Checklist | tests ajoutés, i18n, accessibilité, doc mise à jour |
| Revue | 1 approbation minimum ; 2 si migration de base ou protocole de sync |
| Merge | squash merge, message = titre de PR conforme aux Conventional Commits |
| Après merge | suppression de la branche, vérification du déploiement staging |

### 10.4 Ce qui ne doit jamais être commité

`.env`, secrets, `dist/`, `node_modules/`, `.expo/`, captures d'écran temporaires, `openapi.json` généré manuellement sans revue, code commenté, fichiers de configuration personnels (`.vscode/settings.json` non partagé).

---

## 11. UI/UX

### 11.1 Principes d'interface

| # | Principe | Application |
|---|---|---|
| UX-1 | **La hiérarchie avant la décoration** | Une seule action primaire par écran, un seul accent coloré |
| UX-2 | **Densité maîtrisée** | 8 px de rythme vertical minimum entre groupes ; jamais plus de 3 niveaux de texte dans une carte |
| UX-3 | **Feedback immédiat** | Toute action produit un retour < 100 ms (état optimiste, changement de couleur, micro-animation) |
| UX-4 | **Réversibilité** | Toute suppression est annulable (toast « Annuler », corbeille 30 j) |
| UX-5 | **Pas de modale pour tout** | Préférer un panneau latéral (web) ou une feuille plein écran (mobile) pour les détails |
| UX-6 | **Erreurs actionnables** | Dire ce qui s'est passé, pourquoi, et quoi faire ; jamais « Une erreur est survenue » seul |
| UX-7 | **États vides utiles** | Expliquer la valeur et proposer une action, pas une illustration muette |
| UX-8 | **Cohérence des gestes** | Glisser à droite = compléter, glisser à gauche = reporter (identique partout) |
| UX-9 | **Confirmation proportionnée** | Confirmation forte uniquement pour les actions irréversibles ou de masse |
| UX-10 | **Sobriété émotionnelle** | Pas de confettis à chaque tâche, pas de streak culpabilisant, pas de badge agressif |

### 11.2 Design tokens

| Catégorie | Contrainte |
|---|---|
| Couleur | Uniquement via `packages/design-tokens` ; aucune valeur littérale dans un composant |
| Typographie | 6 tailles maximum ; titres `Inter Display`, texte `Inter` ; interlignage ≥ 1,4 |
| Espacement | échelle 4 px (4, 8, 12, 16, 24, 32, 48, 64) |
| Rayon | 6 (petit), 12 (carte), 20 (feuille), 999 (pilule) |
| Élévation | 2 niveaux maximum (surface, surface flottante) ; bordures plutôt qu'ombres |
| Mouvement | 120 ms (micro), 220 ms (transition) ; jamais > 300 ms ; respecter `prefers-reduced-motion` |

### 11.3 Accessibilité (WCAG 2.2 AA)

| Exigence | Mise en œuvre |
|---|---|
| Contraste | ≥ 4,5:1 texte normal, ≥ 3:1 grand texte et composants |
| Focus | visible, 2 px, contraste ≥ 3:1, jamais supprimé sans remplacement |
| Clavier | tout accessible, ordre logique, pas de piège de focus, `Échap` ferme |
| Libellés | chaque action a un `accessibilityLabel` explicite (pas « icône ») |
| Sémantique | rôles corrects (`button`, `checkbox`, `header`), annonces de changement (`AccessibilityInfo.announceForAccessibility`) |
| Couleur | jamais seul vecteur d'information (priorité = couleur + libellé + position) |
| Mouvement | animations désactivables, pas de clignotement |
| Zoom | mobile : texte jusqu'à 200 % sans perte de fonction |
| Cibles | ≥ 44 px (mobile), 32 px (desktop) |

### 11.4 Contenus et microcopy

| Règle | Exemple |
|---|---|
| Voix active, présent | « Tâche créée » et non « La tâche a été créée » |
| Pas de jargon technique | « Connexion impossible » et non « Network error 500 » |
| Boutons = verbe d'action | « Enregistrer », « Reporter à demain », jamais « OK » |
| Erreurs = cause + remède | « Échéance invalide : choisissez une date après aujourd'hui. » |
| Aucune phrase concaténée | utiliser l'interpolation i18n, jamais `"Tâche " + n + " créée"` |

### 11.5 Internationalisation

- Catalogues `fr` et `en` dans `apps/mobile/src/i18n/locales/` (et équivalent serveur pour les e-mails).
- Clés hiérarchiques : `tasks.detail.reminder.add`.
- Pluralisation via `i18next` (`count`), jamais de `if (n > 1)`.
- Dates et nombres via `Intl` avec la locale active.
- CI : échec si une clé existe dans `fr` sans équivalent `en` (et inversement).

---

## 12. Definition of Done (technique)

Une tâche de développement est terminée lorsque :

1. Le code compile en `strict`, sans `any` implicite ni suppression de type.
2. `pnpm lint` et `pnpm typecheck` passent sans warning.
3. Les tests couvrant le comportement ajouté passent (unitaire + intégration si données).
4. Les quatre états d'écran sont implémentés (chargement, erreur, vide, contenu).
5. L'accessibilité du parcours est vérifiée (clavier, contraste, libellés).
6. Les textes sont traduits en `fr` et `en`.
7. La documentation impactée est mise à jour dans la même PR (ces cinq fichiers ou `openapi.json`).
8. Aucun secret, `console.log` ou code mort n'est introduit.
9. La PR est relue et la CI verte.
10. Le comportement a été vérifié manuellement sur la ou les plateformes concernées (mention explicite de ce qui a été testé).

---

## 13. Checklist de revue de code

### Architecture
- [ ] La logique est au bon endroit (service vs composant vs repository).
- [ ] Aucune dépendance interdite entre paquets/modules.
- [ ] Aucune duplication d'un contrat déjà défini dans `@focus/contracts`.

### Correction
- [ ] Les cas limites sont traités (vide, null, hors ligne, permission).
- [ ] La concurrence est prise en compte (`version`, `If-Match`).
- [ ] Les mutations écrivent le `SyncChange` dans la même transaction.

### Sécurité
- [ ] Autorisation vérifiée serveur (workspace + rôle).
- [ ] Aucune donnée sensible en réponse ou en log.
- [ ] Entrées validées par schéma.

### Qualité
- [ ] Noms explicites, fonctions courtes, pas de code mort.
- [ ] Tests présents et pertinents (assertions réelles).
- [ ] Pas de `TODO` sans ticket.

### Expérience
- [ ] États de chargement/erreur/vide présents.
- [ ] Textes traduits, accessibles, contrastés.
- [ ] Comportement cohérent avec les autres plateformes.

---

## 14. Annexes

### 14.1 Anti-patrons fréquents et remèdes

| Anti-patron | Symptôme | Remède |
|---|---|---|
| État serveur dupliqué dans Zustand | désynchronisation, bugs d'affichage | une seule source : TanStack Query |
| `useEffect` pour synchroniser deux états | boucles de rendu | dériver au rendu |
| Service NestJS qui construit des réponses HTTP | logique métier non testable | retourner des entités, mapper au controller |
| Repository sans `workspaceId` | fuite entre comptes | signature obligatoire `(ctx, ...)` |
| Rechargement complet après chaque mutation | réseau, latence | invalidation ciblée de query |
| Compteur de minuteur en mémoire | perte au background | horodatage absolu |
| `any` pour faire taire TypeScript | bugs à l'exécution | `unknown` + validation |
| Test qui mocke tout | ne teste rien | intégration avec vraie base |

### 14.2 Modèle de PR

```markdown
## Contexte
Pourquoi ce changement existe.

## Changement
- ...
- ...

## Comment tester
1. ...
2. ...

## Vérifications
- [ ] tests unitaires / intégration
- [ ] typecheck + lint
- [ ] i18n fr/en
- [ ] accessibilité
- [ ] documentation

## Captures (si UI)
```

### 14.3 Raccourcis et conventions d'équipe

| Sujet | Convention |
|---|---|
| Langue des commits | anglais technique (`feat(tasks): ...`) |
| Langue du code (identifiants, commentaires) | anglais |
| Langue de la documentation et de l'UI | français par défaut, anglais en second |
| Langue des tickets | français |
| Revue | sous 24 h ouvrées ; un commentaire bloquant préfixé `[bloquant]` |

---

**Fin du document 04.**
