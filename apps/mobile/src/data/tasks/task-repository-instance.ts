import { authenticatedHttp } from "../auth/auth-instance";
import { offlineStore } from "../offline/offline-store-instance";
import { createCachedTaskRepository } from "./cached-task-repository";
import { createTaskRepository } from "./task-repository";

// Composition root : le repository distant est enveloppé du miroir local, donc
// toutes les lectures de l'application alimentent la copie hors ligne.
const httpRepository = createTaskRepository(authenticatedHttp);

export const remoteTaskRepository = httpRepository;
export const taskRepository = createCachedTaskRepository(httpRepository, offlineStore);
