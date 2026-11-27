// Purge définitive des comptes supprimés (RF-06) et des jetons expirés.
// À exécuter quotidiennement par l'ordonnanceur de l'hébergeur :
//   pnpm --filter @focus/api db:purge
// La suppression d'un `User` cascade sur ses workspaces, tâches, projets,
// sessions et journaux (schéma Prisma).
const { PrismaClient } = require("@prisma/client");

const RETENTION_DAYS = 30;

async function main() {
  const prisma = new PrismaClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date();

  try {
    const deletedAccounts = await prisma.user.deleteMany({
      where: { deletedAt: { not: null, lte: cutoff } },
    });
    const expiredResetTokens = await prisma.passwordResetToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
    });
    const expiredSessions = await prisma.session.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });

    console.warn(
      `Purge terminée : ${deletedAccounts.count} compte(s), ` +
        `${expiredResetTokens.count} jeton(s) de réinitialisation, ` +
        `${expiredSessions.count} session(s) expirée(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Purge impossible :", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
