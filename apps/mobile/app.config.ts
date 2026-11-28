import type { ExpoConfig } from "expo/config";

// Identité propre au projet : rien n'est repris d'un produit existant.
const config: ExpoConfig = {
  name: "Focus",
  slug: "focus",
  version: "0.1.0",
  scheme: "focus",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  platforms: ["android", "ios", "web"],
  android: { package: "app.focus.mobile" },
  ios: { bundleIdentifier: "app.focus.mobile", supportsTablet: true },
  web: {
    bundler: "metro",
    output: "static",
    // Servi plus tard avec un fallback SPA (doc 03 §7.2).
    name: "Focus",
  },
  plugins: ["expo-router", "expo-secure-store", "expo-notifications"],
  experiments: { typedRoutes: true },
};

export default config;
