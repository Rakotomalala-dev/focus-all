import { JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../../src/app.module";
import { APP_ENV } from "../../src/config/app-config.module";
import type { Env } from "../../src/config/env.schema";
import { applyHttpConfig } from "../../src/config/http";
import { loadRootEnv } from "../../src/config/load-env";
import { uuidV7 } from "../../src/common/uuid-v7";
import { MAILER, type Mailer } from "../../src/modules/auth/mailer";

// Support des tests d'intégration HTTP : une seule application démarrée avec le
// vrai bootstrap, un seul client de requêtes, des jetons signés par la
// configuration de l'application. Chaque fichier crée ses propres workspaces :
// les tests tournent en parallèle sur la même base sans se voir.
// Ce fichier est exclu du build (`tsconfig.build.json`).
const TEST_JWT_SECRET = "test-secret-0000000000000000000000000000";

export type HttpResult = {
  readonly status: number;
  readonly contentType: string | null;
  readonly headers: Headers;
  readonly body: unknown;
};

export type RequestOptions = {
  readonly method?: string;
  readonly authorization?: string;
  readonly headers?: Record<string, string>;
  // `body` est sérialisé en JSON ; `rawBody` part tel quel (cas du corps
  // volontairement invalide).
  readonly body?: unknown;
  readonly rawBody?: string;
};

export type TokenClaims = {
  readonly userId: string;
  readonly workspaceId?: string;
  readonly expiresIn?: number;
  // Permet de forger un jeton avec un autre secret : le guard doit le refuser.
  readonly secret?: string;
};

export type TestWorkspace = {
  readonly userId: string;
  readonly workspaceId: string;
};

export type TestApi = {
  readonly request: (path: string, options?: RequestOptions) => Promise<HttpResult>;
  readonly bearerToken: (claims: TokenClaims) => Promise<string>;
  // Crée un utilisateur + workspace personnel isolé et renvoie leurs ids.
  readonly createWorkspace: (label?: string) => Promise<TestWorkspace>;
  // Supprime un compte créé par une inscription (cascade sur ses workspaces).
  readonly deleteAccount: (email: string) => Promise<void>;
  // Boîte mémoire : les tests de réinitialisation lisent le lien envoyé sans
  // dépendre d'un serveur SMTP.
  readonly mailbox: TestMailbox;
  readonly close: () => Promise<void>;
};

export type TestMailbox = Mailer & {
  readonly passwordResets: { to: string; link: string; expiresMinutes: number }[];
  readonly deletions: { to: string }[];
  readonly lastPasswordReset: () => { to: string; link: string } | undefined;
};

function createTestMailbox(): TestMailbox {
  const passwordResets: { to: string; link: string; expiresMinutes: number }[] = [];
  const deletions: { to: string }[] = [];

  return {
    passwordResets,
    deletions,
    lastPasswordReset: () => passwordResets[passwordResets.length - 1],
    sendPasswordReset: async (input) => {
      passwordResets.push(input);
    },
    sendAccountDeleted: async (input) => {
      deletions.push(input);
    },
  };
}

// Une base distante (Neon) refuse ou coupe les connexions au-delà de son quota.
// Le harnais ouvre deux pools (application + fixtures) : limiter chacun à trois
// connexions rend la suite stable sans changer la configuration de production.
function withTestConnectionLimits(raw: string): string {
  const url = new URL(raw);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", "5");
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", "20");
  }
  if (!url.searchParams.has("connect_timeout")) {
    url.searchParams.set("connect_timeout", "15");
  }
  return url.toString();
}

export async function startTestApi(): Promise<TestApi> {
  loadRootEnv();
  if (process.env.DATABASE_URL === undefined) {
    throw new Error("DATABASE_URL est requis pour les tests d'intégration.");
  }
  process.env.DATABASE_URL = withTestConnectionLimits(process.env.DATABASE_URL);

  process.env.JWT_ACCESS_SECRET = TEST_JWT_SECRET;
  // Le serveur écoute sur un port éphémère : un `PORT` hérité du shell n'a pas
  // de sens ici et ferait échouer la validation d'environnement.
  delete process.env.PORT;

  const mailbox = createTestMailbox();
  // Même module que la production, avec le port e-mail remplacé : aucun envoi
  // réel et le jeton du lien reste lisible par le test.
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MAILER)
    .useValue(mailbox)
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: ["error"],
  });
  // Même configuration HTTP que `main.ts` : préfixe et CORS viennent de l'env.
  applyHttpConfig(app);
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = app.get<Env>(APP_ENV);

  const prisma = new PrismaClient();
  const workspaceIds: string[] = [];
  const userIds: string[] = [];

  async function bearerToken(claims: TokenClaims): Promise<string> {
    // Un claim absent n'est pas envoyé du tout : `workspaceId: undefined`
    // passerait la validation de signature mais changerait le sens du test.
    const payload = claims.workspaceId === undefined ? {} : { workspaceId: claims.workspaceId };
    const signOptions: { subject: string; expiresIn?: number } = { subject: claims.userId };
    if (claims.expiresIn !== undefined) {
      signOptions.expiresIn = claims.expiresIn;
    }

    const jwt =
      claims.secret === undefined
        ? app.get(JwtService)
        : new JwtService({
            secret: claims.secret,
            signOptions: { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE },
          });

    return `Bearer ${await jwt.signAsync(payload, signOptions)}`;
  }

  async function createWorkspace(label = "test"): Promise<TestWorkspace> {
    const userId = uuidV7();
    const workspaceId = uuidV7();
    await prisma.user.create({
      data: {
        id: userId,
        email: `test-${userId}@focus.local`,
        // Ce compte ne se connecte pas : les tests qui exercent /auth/register
        // passent par le vrai hachage Argon2id.
        passwordHash: "test-account-without-login",
        displayName: label,
      },
    });
    await prisma.workspace.create({
      data: { id: workspaceId, name: `Espace ${label}`, ownerId: userId, isPersonal: true },
    });
    await prisma.workspaceMember.create({
      data: { workspaceId, userId, role: "OWNER" },
    });
    workspaceIds.push(workspaceId);
    userIds.push(userId);
    return { userId, workspaceId };
  }

  async function deleteAccount(email: string): Promise<void> {
    // La cascade User → Workspace → Task/SyncChange est déclarée au schéma.
    await prisma.user.deleteMany({ where: { email } });
  }

  async function request(path: string, options: RequestOptions = {}): Promise<HttpResult> {
    const headers: Record<string, string> = { ...options.headers };
    if (options.authorization !== undefined) {
      headers.authorization = options.authorization;
    }

    const body =
      options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
    if (body !== undefined && headers["content-type"] === undefined) {
      headers["content-type"] = "application/json";
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      ...(body === undefined ? {} : { body }),
    });
    const text = await response.text();

    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      headers: response.headers,
      body: text.length > 0 ? JSON.parse(text) : null,
    };
  }

  async function close(): Promise<void> {
    if (workspaceIds.length > 0) {
      await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    }
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
    await app.close();
  }

  return { request, bearerToken, createWorkspace, deleteAccount, mailbox, close };
}
