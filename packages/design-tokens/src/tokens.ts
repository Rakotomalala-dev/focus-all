// Source unique du langage visuel (doc 01 §7.5, doc 04 §11.2). Les valeurs
// sont celles du document ; les neutres de texte, non listés, sont choisis pour
// tenir le contraste AA (vérifié par tokens.spec.ts) et ne doivent pas être
// remplacés par des littéraux dans un composant.

export type ThemeMode = "light" | "dark";

export type Palette = {
  readonly bg: { readonly canvas: string; readonly surface: string };
  readonly text: { readonly primary: string; readonly muted: string; readonly onAccent: string };
  readonly accent: string;
  readonly accentAlt: string;
  readonly state: { readonly success: string; readonly danger: string };
  readonly priority: { readonly urgent: string };
  // Bordure 1 px à 8 % d'opacité : le langage « papier calme » préfère les
  // bordures aux ombres (doc 01 §7.5, doc 04 §11.2).
  readonly border: string;
};

export const palettes: Readonly<Record<ThemeMode, Palette>> = {
  light: {
    bg: { canvas: "#F7F7F5", surface: "#FFFFFF" },
    text: { primary: "#14181D", muted: "#5A6068", onAccent: "#14181D" },
    accent: "#E8A33D",
    accentAlt: "#4F8DF7",
    state: { success: "#3FB984", danger: "#E05C5C" },
    priority: { urgent: "#F0553C" },
    border: "rgba(11, 15, 20, 0.08)",
  },
  dark: {
    bg: { canvas: "#0B0F14", surface: "#121821" },
    text: { primary: "#ECEEF1", muted: "#9AA3AE", onAccent: "#14181D" },
    accent: "#E8A33D",
    accentAlt: "#4F8DF7",
    state: { success: "#3FB984", danger: "#E05C5C" },
    priority: { urgent: "#F0553C" },
    border: "rgba(255, 255, 255, 0.08)",
  },
};

// Échelle 4 px du doc 04 §11.2 : tout espacement d'un composant vient d'ici.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
  "4xl": 64,
} as const;

export const radii = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const fontFamilies = {
  text: "Inter",
  display: "Inter Display",
} as const;

// Six tailles au maximum (doc 04 §11.2) ; chaque interlignage respecte le
// ratio ≥ 1,4 exigé par le même document.
export const typography = {
  xs: { size: 12, lineHeight: 17 },
  sm: { size: 14, lineHeight: 20 },
  md: { size: 16, lineHeight: 23 },
  lg: { size: 20, lineHeight: 28 },
  xl: { size: 28, lineHeight: 40 },
  display: { size: 34, lineHeight: 48 },
} as const;

export const motion = {
  fast: 120,
  base: 220,
  easing: "ease-out",
} as const;

export const border = { width: 1 } as const;
