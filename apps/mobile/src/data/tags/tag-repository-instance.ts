import { authenticatedHttp } from "../auth/auth-instance";
import { createTagRepository } from "./tag-repository";

export const tagRepository = createTagRepository(authenticatedHttp);
