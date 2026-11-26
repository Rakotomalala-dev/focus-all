// Jeu de données de développement — `pnpm --filter @focus/api db:seed`.
// Idempotent : les identifiants sont fixes, un second passage met à jour au lieu
// de dupliquer. Aucune donnée réelle, aucun secret : le mot de passe est celui
// documenté en doc 03 §2.4 pour le compte de démonstration local.
const { hash } = require("@node-rs/argon2");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const USER_ID = "0192a000-0000-7000-8000-000000000001";
const WORKSPACE_ID = "0192a000-0000-7000-8000-000000000002";
const PROJECT_ID = "0192a000-0000-7000-8000-000000000003";

const DEMO_EMAIL = process.env.SEED_EMAIL ?? "demo@focus.local";
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "focus-dev-password";

const TASKS = [
  {
    id: "0192a000-0000-7000-8000-000000000011",
    title: "Découvrir la vue Aujourd'hui",
    sortOrder: "1.000000000000000",
  },
  {
    id: "0192a000-0000-7000-8000-000000000012",
    title: "Créer un projet",
    sortOrder: "2.000000000000000",
  },
  {
    id: "0192a000-0000-7000-8000-000000000013",
    title: "Planifier la semaine",
    sortOrder: "3.000000000000000",
  },
];

async function main() {
  const passwordHash = await hash(DEMO_PASSWORD, {
    // 2 = Argon2id (l'enum du paquet est un const enum interdit par
    // `isolatedModules`).
    algorithm: 2,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  await prisma.user.upsert({
    where: { id: USER_ID },
    update: { email: DEMO_EMAIL, displayName: "Démo Focus" },
    create: {
      id: USER_ID,
      email: DEMO_EMAIL,
      passwordHash,
      displayName: "Démo Focus",
    },
  });

  await prisma.workspace.upsert({
    where: { id: WORKSPACE_ID },
    update: {},
    create: {
      id: WORKSPACE_ID,
      name: "Espace de Démo",
      ownerId: USER_ID,
      isPersonal: true,
    },
  });

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: USER_ID } },
    update: { role: "OWNER" },
    create: { workspaceId: WORKSPACE_ID, userId: USER_ID, role: "OWNER" },
  });

  await prisma.project.upsert({
    where: { id: PROJECT_ID },
    update: {},
    create: {
      id: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      name: "Inbox",
      color: "blue",
    },
  });

  for (const task of TASKS) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: {},
      create: {
        id: task.id,
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        title: task.title,
        sortOrder: task.sortOrder,
        tagIds: [],
        createdBy: USER_ID,
      },
    });
  }

  process.stdout.write(
    `Seed terminé : ${DEMO_EMAIL} / workspace ${WORKSPACE_ID} / ${TASKS.length} tâches.\n`,
  );
}

main()
  .catch((error) => {
    process.stderr.write(
      `Seed échoué : ${error instanceof Error ? error.message : "erreur inconnue"}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
