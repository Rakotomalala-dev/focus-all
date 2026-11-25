import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Platform } from "react-native";
import { createHttpClient } from "../http/client";
import { useSessionStore } from "../session/session-store";
import { createTaskRepository, type TaskRepository } from "./task-repository";

// Doc 03 §4.2 : l'URL vient d'`EXPO_PUBLIC_API_URL` ; le repli loopback ne sert
// qu'au développement local, jamais à une build de production.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

const TaskRepositoryContext = createContext<TaskRepository | null>(null);

export type TaskRepositoryProviderProps = {
  readonly children: ReactNode;
};

export function TaskRepositoryProvider({ children }: TaskRepositoryProviderProps) {
  const repository = useMemo(
    () =>
      createTaskRepository(
        createHttpClient({
          baseUrl: API_BASE_URL,
          platform: Platform.OS,
          getAccessToken: () => useSessionStore.getState().accessToken,
        }),
      ),
    [],
  );

  return (
    <TaskRepositoryContext.Provider value={repository}>{children}</TaskRepositoryContext.Provider>
  );
}

export function useTaskRepository(): TaskRepository {
  const repository = useContext(TaskRepositoryContext);
  if (repository === null) {
    throw new Error("TaskRepositoryProvider is missing");
  }
  return repository;
}
