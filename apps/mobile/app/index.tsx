import { StyleSheet, Text, View } from "react-native";

// Écran de validation du socle : aucune fonctionnalité métier (phase M0).
export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Focus</Text>
      <Text style={styles.subtitle}>Socle technique M0 — les fonctionnalités arrivent aux étapes suivantes.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
