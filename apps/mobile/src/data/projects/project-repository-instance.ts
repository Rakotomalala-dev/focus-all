import { authenticatedHttp } from "../auth/auth-instance";
import { offlineStore } from "../offline/offline-store-instance";
import { createCachedProjectRepository } from "./cached-project-repository";
import { createProjectRepository } from "./project-repository";

const httpRepository = createProjectRepository(authenticatedHttp);

export const remoteProjectRepository = httpRepository;
export const projectRepository = createCachedProjectRepository(httpRepository, offlineStore);
