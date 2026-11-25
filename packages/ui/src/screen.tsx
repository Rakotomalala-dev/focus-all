import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useFocusTheme } from "./use-focus-theme";

export type ScreenProps = {
  readonly children?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
};

// Fond applicatif et marge de base : toute surface part de ce composant, donc
// aucun écran n'a besoin d'une couleur littérale (doc 04 §11.2).
export function Screen({ children, style }: ScreenProps) {
  const theme = useFocusTheme();

  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: theme.colors.bg.canvas,
          padding: theme.spacing.xl,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
