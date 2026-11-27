import type { FastifyRequest } from "fastify";

// Contexte de requête authentifiée : tout vient du jeton vérifié, jamais du
// corps ni de la query (N-3/S-2). Le repository ne reçoit que ce workspace.
export type AuthContext = {
  readonly userId: string;
  readonly workspaceId: string;
  // Session émettrice du jeton d'accès : permet de distinguer la session
  // courante lors d'une révocation ou d'un changement de mot de passe.
  readonly sessionId?: string;
};

// La requête porte le contexte une fois le guard passé ; le décorateur
// `@CurrentAuth()` le relit pour le controller.
export type AuthenticatedRequest = FastifyRequest & { auth?: AuthContext };
