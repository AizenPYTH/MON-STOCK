import { AppState, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";

/**
 * Données serveur : cache court, rafraîchissement au retour au premier plan, et mise en pause
 * des LECTURES hors connexion (reprise automatique au retour du réseau).
 *
 * Écritures (M-03) : `networkMode: "always"` — une mutation n'est JAMAIS mise en pause puis rejouée
 * plus tard à l'insu de l'utilisateur. Hors ligne, l'appel échoue tout de suite avec le message
 * « connexion indisponible » ; rien n'est affiché comme réussi tant que la base n'a pas répondu.
 */

/** Codes d'erreur pour lesquels réessayer ne changera rien (refus, validation, délai déjà long). */
const NO_RETRY_CODES = new Set([
  // PostgREST / PostgreSQL
  "42501",
  "PGRST301",
  "22P02",
  "23505",
  "23503",
  "P0001",
  "P0002",
  // Erreurs métier de l'API MON STOCK (UserFacingError.code)
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "VALIDATION",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "NOT_CONFIGURED",
  "NOT_IMPLEMENTED",
  "CONNECTION_EXPIRED",
  "TIMEOUT",
  "OFFLINE",
  "CONFIG",
  "REJECTED",
]);

/** M-14 : au plus 2 nouvelles tentatives, et seulement pour une panne passagère (serveur, réseau). */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && NO_RETRY_CODES.has(code)) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: shouldRetryQuery,
        refetchOnReconnect: true,
      },
      mutations: { retry: false, networkMode: "always" },
    },
  });
}

let wired = false;

/** Relie React Query à l'état réseau (NetInfo) et à l'état de l'application (premier plan). */
export function wireQueryEnvironment(): () => void {
  if (wired) return () => {};
  wired = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    }),
  );
  const sub = AppState.addEventListener("change", (status: AppStateStatus) => focusManager.setFocused(status === "active"));
  return () => {
    sub.remove();
    wired = false;
  };
}
