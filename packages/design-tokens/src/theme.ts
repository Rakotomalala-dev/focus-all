import {
  border,
  fontFamilies,
  motion,
  palettes,
  radii,
  spacing,
  typography,
  type Palette,
  type ThemeMode,
} from "./tokens";

export type Theme = {
  readonly mode: ThemeMode;
  readonly colors: Palette;
  readonly spacing: typeof spacing;
  readonly radii: typeof radii;
  readonly fontFamilies: typeof fontFamilies;
  readonly typography: typeof typography;
  readonly motion: typeof motion;
  readonly border: typeof border;
};

export function createTheme(mode: ThemeMode): Theme {
  return {
    mode,
    colors: palettes[mode],
    spacing,
    radii,
    fontFamilies,
    typography,
    motion,
    border,
  };
}

// Deux thèmes seulement (clair/sombre) : le mode suit le réglage système tant
// qu'aucune préférence utilisateur n'est stockée (doc 04 §11.2).
export const themes: Readonly<Record<ThemeMode, Theme>> = {
  light: createTheme("light"),
  dark: createTheme("dark"),
};
