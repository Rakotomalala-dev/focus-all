import { themes, type Theme } from "@focus/design-tokens";
import { useColorScheme } from "react-native";

// Le mode suit le réglage système (`userInterfaceStyle: "automatic"` dans la
// configuration Expo). Une préférence explicite viendra avec l'écran Réglages ;
// aucun store n'est créé d'ici là (O9).
export function useFocusTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === "dark" ? themes.dark : themes.light;
}
