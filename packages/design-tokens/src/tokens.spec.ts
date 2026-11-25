import { describe, expect, it } from "vitest";
import { palettes, radii, spacing, typography } from "./tokens";
import type { ThemeMode } from "./tokens";

// Les tokens portent des contraintes documentées : les vérifier ici évite
// qu'une valeur ajoutée plus tard casse le contraste ou l'échelle 4 px sans
// qu'aucun écran ne le signale.
type Rgb = { readonly r: number; readonly g: number; readonly b: number };

function parseHex(hex: string): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) {
    throw new Error(`Couleur non hexadécimale : ${hex}`);
  }
  return {
    r: Number.parseInt(match[1] ?? "0", 16),
    g: Number.parseInt(match[2] ?? "0", 16),
    b: Number.parseInt(match[3] ?? "0", 16),
  };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number): number => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [
    relativeLuminance(parseHex(foreground)),
    relativeLuminance(parseHex(background)),
  ].sort((a, b) => b - a) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

const MODES: readonly ThemeMode[] = ["light", "dark"];

describe("palettes", () => {
  it("décrivent les mêmes surfaces et les mêmes textes dans les deux modes", () => {
    const shape = (mode: ThemeMode): string[] => {
      const palette = palettes[mode];
      return Object.entries(palette)
        .flatMap(([group, value]) =>
          typeof value === "string"
            ? [`${group}`]
            : Object.keys(value).map((key) => `${group}.${key}`),
        )
        .sort();
    };

    expect(shape("light")).toEqual(shape("dark"));
  });

  it("gardent un contraste AA (≥ 4,5:1) pour le texte sur les deux surfaces", () => {
    for (const mode of MODES) {
      const palette = palettes[mode];
      for (const surface of [palette.bg.canvas, palette.bg.surface]) {
        expect(contrast(palette.text.primary, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(palette.text.muted, surface)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(palette.text.onAccent, palette.accent)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("échelles", () => {
  it("respecte une échelle d'espacement de 4 px strictement croissante", () => {
    const values = Object.values(spacing);

    expect(values.every((value) => value % 4 === 0)).toBe(true);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
  });

  it("limite la typographie à six tailles avec un interlignage ≥ 1,4", () => {
    const entries = Object.values(typography);

    expect(entries).toHaveLength(6);
    for (const { size, lineHeight } of entries) {
      expect(lineHeight / size).toBeGreaterThanOrEqual(1.4);
    }
  });

  it("fixe les rayons et les mouvements attendus", () => {
    expect(radii).toMatchObject({ sm: 6, md: 12, lg: 20, pill: 999 });
    expect(palettes.light.border).toContain("0.08");
  });
});
