import { authenticatedHttp } from "../auth/auth-instance";
import { createViewsRepository } from "./views-repository";

// Composition root : même client authentifié que les autres repositories, donc
// jeton courant et refresh sur 401.
export const viewsRepository = createViewsRepository(authenticatedHttp);
