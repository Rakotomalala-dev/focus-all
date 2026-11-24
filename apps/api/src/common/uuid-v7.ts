import { randomBytes } from "node:crypto";

// UUID v7 (ADR-017) : ordonné dans le temps, donc adapté aux index et à la
// fusion hors ligne. Node 22 ne fournit que `randomUUID()` (v4), d'où cette
// implémentation minimale : 48 bits d'horodatage en ms, version 7, variante RFC.
export function uuidV7(now: number = Date.now()): string {
  const bytes = randomBytes(16);

  // 6 octets d'horodatage big-endian.
  for (let index = 0; index < 6; index += 1) {
    bytes[index] = Math.floor(now / 2 ** (8 * (5 - index))) & 0xff;
  }
  // Octet 6 : version 7 sur les 4 bits de poids fort.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  // Octet 8 : variante RFC 4122 (10xx).
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
