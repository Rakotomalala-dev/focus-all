import { Platform } from "react-native";
import { createHttpClient } from "../http/client";
import { createTaskRepository } from "./task-repository";

// Composition root : une seule instance construite au chargement du module.
// L'injection du jeton et la file de rafraîchissement arriveront avec
// l'authentification ; d'ici là l'API répond 401 et l'écran l'affiche.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export const taskRepository = createTaskRepository(
  createHttpClient({ baseUrl: API_BASE_URL, platform: Platform.OS }),
);
