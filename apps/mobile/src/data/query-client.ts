import { QueryClient } from "@tanstack/react-query";

// ADR-007 : TanStack Query est l'unique source de l'état serveur. Un seul essai
// supplémentaire suffit pour un réseau mobile instable ; l'invalidation après
// mutation reste ciblée dans les hooks de la feature.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
    },
  },
});
