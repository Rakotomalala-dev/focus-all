import { NestFactory } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "../app.module";
import { APP_ENV } from "../config/app-config.module";
import type { Env } from "../config/env.schema";
import { applyHttpConfig } from "../config/http";

// Support des tests d'intégration HTTP : une seule application démarrée avec le
// vrai bootstrap, un seul client de requêtes, des jetons signés par la
// configuration de l'application. Sans ce support, chaque spec réimplémente
// `fetch`, le port éphémère et la signature — et finit par tester autre chose
// que le serveur réel. Ce fichier est exclu du build (`tsconfig.build.json`).
const TEST_JWT_SECRET = "test-secret-0000000000000000000000000000";
export const TEST_WORKSPACE_ID = "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e5f";
export const TEST_USER_ID = "018f3b3c-1a2b-7c3d-8e4f-444444444444";

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

export type TestApi = {
  readonly request: (path: string, options?: RequestOptions) => Promise<HttpResult>;
  readonly bearerToken: (claims: TokenClaims) => Promise<string>;
  readonly close: () => Promise<void>;
};

export async function startTestApi(): Promise<TestApi> {
  process.env.JWT_ACCESS_SECRET = TEST_JWT_SECRET;

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  // Même configuration HTTP que `main.ts` : préfixe et CORS viennent de l'env.
  applyHttpConfig(app);
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = app.get<Env>(APP_ENV);

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

  return { request, bearerToken, close: () => app.close() };
}
