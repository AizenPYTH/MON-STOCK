import { AppState, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";

/**
 * Données serveur : cache court, rafraîchissement au retour au premier plan, et mise en pause
 * des requêtes hors connexion (reprise automatique au retour du réseau).
 * Aucune écriture n'est mise en file hors ligne : un mouvement de stock doit être confirmé par la base.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: (failureCount, error) => {
          const code = (error as { code?: unknown } | null)?.code;
          // Refus d'accès / validation : réessayer ne changera rien.
          if (code === "42501" || code === "PGRST301" || code === "22P02") return false;
          return failureCount < 2;
        },
        refetchOnReconnect: true,
      },
      mutations: { retry: false, networkMode: "online" },
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
