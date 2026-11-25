import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  // Le plugin transforme les sources Flow de React Native, mocke la frontière
  // native et branche RNTL ; il configure aussi le runtime JSX.
  plugins: [reactNative()],
  test: {
    environment: "node",
    include: ["src/**/*.spec.{ts,tsx}"],
    // RNTL enregistre ses matchers au chargement via `expect.extend`.
    globals: true,
    restoreMocks: true,
  },
});
