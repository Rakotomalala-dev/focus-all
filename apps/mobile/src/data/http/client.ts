import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
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
  readonly delete: <T>(path: string, schema: ResponseSchema<T>, query?: HttpQuery) => Promise<T>;
};

// Le client ne connaît ni le store ni le service d'authentification : il reçoit
// un lecteur de jeton et une fonction de rafraîchissement, ce qui garde la
// couche transport testable et évite un cycle store → API → client.
export type HttpClientAuth = {
  readonly getAccessToken: () => string | null;
  readonly refreshAccessToken: () => Promise<string | null>;
};

export type HttpClientOptions = {
  readonly baseUrl: string;
  readonly platform: string;
  readonly auth?: HttpClientAuth;
};

const REQUEST_TIMEOUT_MS = 15_000;

type RetriableConfig = InternalAxiosRequestConfig & { authRetried?: boolean };

export function createHttpClient({
  baseUrl,
  platform,
  auth,
}: HttpClientOptions): HttpClient {
  const instance: AxiosInstance = axios.create({
    baseURL: baseUrl,
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      Accept: "application/json",
      "X-Client-Platform": platform,
    },
  });

  if (auth !== undefined) {
    instance.interceptors.request.use((config) => {
      const token = auth.getAccessToken();
      if (token !== null) {
        config.headers.set("Authorization", `Bearer ${token}`);
      }
      return config;
    });

    instance.interceptors.response.use(
      (response) => response,
      async (error: unknown) => {
        if (!axios.isAxiosError(error) || error.response?.status !== 401) {
          throw error;
        }

        const config = error.config as RetriableConfig | undefined;
        // Un 401 après refresh est définitif : réessayer boucherait sur la même
        // réponse et masquerait une révocation de session.
        if (config === undefined || config.authRetried === true) {
          throw error;
        }

        config.authRetried = true;
        const token = await auth.refreshAccessToken();
        if (token === null) {
          throw error;
        }

        config.headers.set("Authorization", `Bearer ${token}`);
        return instance.request(config);
      },
    );
  }

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
    delete: (path, schema, query) =>
      send(instance.delete(path, query === undefined ? {} : { params: query }), schema),
  };
}
