import { themes, type Theme } from "@focus/design-tokens";
import { createContext, useContext, type ReactNode } from "react";
import { useColorScheme } from "react-native";

// Le fournisseur porte la préférence serveur (`LIGHT`/`DARK`/`SYSTEM`) ; sans
// fournisseur, le mode système reste le défaut. Aucun écran ne connaît de
// couleur littérale.
export type ThemeMode = "LIGHT" | "DARK" | "SYSTEM";

const ThemeModeContext = createContext<ThemeMode>("SYSTEM");

export type FocusThemeProviderProps = {
  readonly mode: ThemeMode;
  readonly children: ReactNode;
};

export function FocusThemeProvider({ mode, children }: FocusThemeProviderProps) {
  return <ThemeModeContext.Provider value={mode}>{children}</ThemeModeContext.Provider>;
}

export function useFocusTheme(): Theme {
  const mode = useContext(ThemeModeContext);
  const scheme = useColorScheme();
  const isDark = mode === "DARK" || (mode === "SYSTEM" && scheme === "dark");
  return isDark ? themes.dark : themes.light;
}
