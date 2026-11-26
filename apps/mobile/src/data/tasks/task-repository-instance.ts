import { authenticatedHttp } from "../auth/auth-instance";
import { createTaskRepository } from "./task-repository";

// Composition root : le repository partage le client authentifié, donc chaque
// requête porte le jeton courant et bénéficie du refresh sur 401.
export const taskRepository = createTaskRepository(authenticatedHttp);
