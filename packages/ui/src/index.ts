// Surface publique du design system : une feature n'importe jamais un fichier
// interne (AGENTS §1.3), et les tokens restent accessibles via leur paquet.
export { AppText, type AppTextProps, type TextTone } from "./app-text";
export { Screen, type ScreenProps } from "./screen";
export {
  FocusThemeProvider,
  useFocusTheme,
  type FocusThemeProviderProps,
  type ThemeMode,
} from "./use-focus-theme";
