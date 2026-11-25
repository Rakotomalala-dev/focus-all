import axios, { type AxiosInstance } from "axios";
import { toAppError } from "./app-error";

// Le contrat est la seule source des types de réponse : chaque appel fournit le
// schéma `@focus/contracts` qui valide le corps, donc une dérive serveur devient
// une erreur typée au lieu d'un objet à moitié valide dans l'UI (ADR-009).
export type ResponseSchema<T> = { readonly parse: (data: unknown) => T };

export type HttpQuery = Readonly<Record<string, string | number>>;

export type HttpClient = {
  readonly get: <T>(path: string, schema: ResponseSchema<T>, query?: HttpQuery) => Promise<T>;
  readonly post: <T>(path: string, body: unknown, schema: ResponseSchema<T>) => Promise<T>;
  readonly patch: <T>(path: string, body: unknown, schema: ResponseSchema<T>) => Promise<T>;
};

export type HttpClientOptions = {
  readonly baseUrl: string;
  readonly getAccessToken: () => string | null;
  readonly platform: string;
  readonly timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const instance: AxiosInstance = axios.create({
    baseURL: options.baseUrl,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    headers: {
      Accept: "application/json",
      "X-Client-Platform": options.platform,
    },
  });

  // Jeton en mémoire uniquement (ADR-007) : le client interroge le store au
  // moment de la requête, jamais une copie figée à la création.
  instance.interceptors.request.use((config) => {
    const token = options.getAccessToken();
    if (token !== null) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  async function send<T>(
    request: Promise<{ data: unknown }>,
    schema: ResponseSchema<T>,
  ): Promise<T> {
    try {
      const response = await request;
      return schema.parse(response.data);
    } catch (error) {
      throw toAppError(error);
    }
  }

  return {
    get: (path, schema, query) =>
      send(instance.get(path, query === undefined ? {} : { params: query }), schema),
    post: (path, body, schema) => send(instance.post(path, body), schema),
    patch: (path, body, schema) => send(instance.patch(path, body), schema),
  };
}
