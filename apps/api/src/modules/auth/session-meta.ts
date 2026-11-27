import type { FastifyRequest } from "fastify";

// Métadonnées de session : plateforme déclarée par le client, agent utilisateur
// et adresse réseau. Elles servent uniquement à l'affichage RF-03/RF-70.
export type SessionMeta = {
  readonly platform?: string;
  readonly deviceName?: string;
  readonly userAgent?: string;
  readonly ip?: string;
};

function detectPlatform(userAgent: string | undefined): string | undefined {
  if (userAgent === undefined) {
    return undefined;
  }
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ios/i.test(userAgent)) return "ios";
  if (/windows/i.test(userAgent)) return "windows";
  if (/macintosh|mac os/i.test(userAgent)) return "macos";
  if (/linux/i.test(userAgent)) return "linux";
  return "web";
}

export function sessionMetaFrom(
  request: FastifyRequest,
  deviceName?: string,
): SessionMeta {
  const declared = request.headers["x-client-platform"];
  const platformHeader = Array.isArray(declared) ? declared[0] : declared;
  const rawAgent = request.headers["user-agent"];
  const userAgent = Array.isArray(rawAgent) ? rawAgent[0] : rawAgent;

  const platform =
    typeof platformHeader === "string" && platformHeader.trim().length > 0
      ? platformHeader.trim().slice(0, 20)
      : detectPlatform(userAgent);

  return {
    ...(platform === undefined ? {} : { platform }),
    ...(deviceName === undefined ? {} : { deviceName }),
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(request.ip === undefined ? {} : { ip: request.ip }),
  };
}
