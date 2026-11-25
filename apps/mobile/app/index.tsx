import { AppText, Screen, useFocusTheme } from "@focus/ui";
import { View } from "react-native";

// Écran de validation du socle : aucune fonctionnalité métier, mais il passe
// déjà par le design system — plus aucune couleur ni taille littérale ici.
export default function HomeScreen() {
  const theme = useFocusTheme();

  return (
    <Screen>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: theme.spacing.sm,
        }}
      >
        <AppText tone="display">Focus</AppText>
        <AppText tone="muted" style={{ textAlign: "center" }}>
          Socle technique M0 — les fonctionnalités arrivent aux étapes suivantes.
        </AppText>
      </View>
    </Screen>
  );
}
