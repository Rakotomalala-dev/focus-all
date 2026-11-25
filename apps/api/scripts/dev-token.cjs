"use strict";

// Émet un jeton d'accès local, signé avec `JWT_ACCESS_SECRET`, pour appeler
// l'API à la main tant que `POST /auth/login` n'existe pas (pas de stockage
// utilisateur : Prisma n'est pas en place). Le secret vient de l'environnement,
// jamais d'un fichier commité (O3).
//
// Usage :
//   node scripts/dev-token.cjs <userId> <workspaceId>

const { JwtService } = require("@nestjs/jwt");

const MIN_SECRET_LENGTH = 32;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const secret = process.env.JWT_ACCESS_SECRET;
if (secret === undefined || secret.length < MIN_SECRET_LENGTH) {
  fail(`JWT_ACCESS_SECRET absent ou plus court que ${MIN_SECRET_LENGTH} caractères.`);
}

const [userId, workspaceId] = process.argv.slice(2);
if (userId === undefined || workspaceId === undefined) {
  fail("Usage : node scripts/dev-token.cjs <userId> <workspaceId>");
}

const jwt = new JwtService({
  secret,
  signOptions: {
    issuer: process.env.JWT_ISSUER ?? "focus-api",
    audience: process.env.JWT_AUDIENCE ?? "focus-clients",
    expiresIn: process.env.JWT_ACCESS_TTL ?? "15m",
  },
});

process.stdout.write(`${jwt.sign({ workspaceId }, { subject: userId })}\n`);
