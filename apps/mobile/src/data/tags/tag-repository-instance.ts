import { authenticatedHttp } from "../auth/auth-instance";
import { offlineStore } from "../offline/offline-store-instance";
import { createCachedTagRepository } from "./cached-tag-repository";
import { createTagRepository } from "./tag-repository";

const httpRepository = createTagRepository(authenticatedHttp);

export const remoteTagRepository = httpRepository;
export const tagRepository = createCachedTagRepository(httpRepository, offlineStore);
