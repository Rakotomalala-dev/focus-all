import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

// ADR-018 : `fr` par défaut, `en` fourni ; la parité des deux catalogues et la
// présence de chaque code d'erreur sont vérifiées par `catalogs.spec.ts`.
void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: "fr",
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
});

export default i18n;
