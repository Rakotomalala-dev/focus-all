import { describe, expect, it } from "vitest";
import { ERROR_MESSAGE_KEYS } from "../data/http/app-error";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) {
    return prefix.length === 0 ? [] : [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix.length === 0 ? key : `${prefix}.${key}`),
  );
}

describe("i18n catalogs", () => {
  it("expose les mêmes clés en français et en anglais", () => {
    expect(flattenKeys(en).sort()).toEqual(flattenKeys(fr).sort());
  });

  it("traduit chaque code d'erreur, le réseau et le cas inconnu", () => {
    const keys = new Set(flattenKeys(fr));

    for (const key of [...Object.values(ERROR_MESSAGE_KEYS), "errors.network", "errors.unknown"]) {
      expect(keys.has(key)).toBe(true);
    }
  });
});
