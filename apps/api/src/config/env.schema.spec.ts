import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.schema";

const SECRET = "x".repeat(32);

describe("loadEnv", () => {
  it("applique les valeurs par défaut documentées", () => {
    const env = loadEnv({ JWT_ACCESS_SECRET: SECRET });

    expect(env).toEqual({
      NODE_ENV: "development",
      PORT: 4000,
      API_PREFIX: "/api/v1",
      CORS_ORIGINS: ["http://localhost:8081"],
      JWT_ACCESS_SECRET: SECRET,
      JWT_ACCESS_TTL: "15m",
      JWT_REFRESH_TTL: "30d",
      JWT_ISSUER: "focus-api",
      JWT_AUDIENCE: "focus-clients",
      ARGON2_MEMORY_KIB: 19_456,
      ARGON2_TIME_COST: 2,
    });
  });

  it("lit le port et le préfixe fournis", () => {
    const env = loadEnv({ JWT_ACCESS_SECRET: SECRET, PORT: "4100", API_PREFIX: "/api/v2" });

    expect(env.PORT).toBe(4100);
    expect(env.API_PREFIX).toBe("/api/v2");
  });

  it("retombe sur 4000 pour un PORT vide, mais refuse un PORT non numérique", () => {
    expect(loadEnv({ JWT_ACCESS_SECRET: SECRET, PORT: "" }).PORT).toBe(4000);
    expect(() => loadEnv({ JWT_ACCESS_SECRET: SECRET, PORT: "abc" })).toThrow(/PORT/);
  });

  it("refuse un secret absent ou trop court sans recopier sa valeur", () => {
    expect(() => loadEnv({})).toThrow(/JWT_ACCESS_SECRET/);

    const shortSecret = "trop-court";
    try {
      loadEnv({ JWT_ACCESS_SECRET: shortSecret });
      expect.unreachable("un secret court doit faire échouer le chargement");
    } catch (error) {
      // Le message cite la variable, jamais sa valeur (S-5/S-12).
      expect(error instanceof Error ? error.message : "").not.toContain(shortSecret);
    }
  });

  it("refuse un préfixe sans barre oblique et un NODE_ENV inconnu", () => {
    expect(() => loadEnv({ JWT_ACCESS_SECRET: SECRET, API_PREFIX: "api/v1" })).toThrow(
      /API_PREFIX/,
    );
    expect(() => loadEnv({ JWT_ACCESS_SECRET: SECRET, NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });

  it("découpe CORS_ORIGINS en ignorant les entrées vides", () => {
    const env = loadEnv({
      JWT_ACCESS_SECRET: SECRET,
      CORS_ORIGINS: " http://a.test , http://b.test ,, ",
    });

    expect(env.CORS_ORIGINS).toEqual(["http://a.test", "http://b.test"]);
  });
});
