import { authenticatedHttp } from "../auth/auth-instance";
import { createProjectRepository } from "./project-repository";

export const projectRepository = createProjectRepository(authenticatedHttp);
