import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "~/lib/supabase";

export type SessionState =
  | { status: "loading"; session: null }
  | { status: "signedOut"; session: null }
  | { status: "signedIn"; session: Session };

const SessionContext = createContext<SessionState>({ status: "loading", session: null });

/**
 * Session Supabase de l'appareil :
 * - restaurée depuis le trousseau au démarrage ;
 * - renouvelée automatiquement tant que l'application est au premier plan
 *   (startAutoRefresh / stopAutoRefresh selon AppState, recommandation Supabase) ;
 * - toute expiration ou déconnexion (ici ou révocation côté serveur) repasse en « signedOut ».
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  // Sans configuration (écran d'erreur dédié), il n'y a pas de session à restaurer.
  const [state, setState] = useState<SessionState>(() => (getSupabase() ? { status: "loading", session: null } : { status: "signedOut", session: null }));

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setState(data.session ? { status: "signedIn", session: data.session } : { status: "signedOut", session: null });
      })
      .catch(() => active && setState({ status: "signedOut", session: null }));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session ? { status: "signedIn", session } : { status: "signedOut", session: null });
    });

    if (AppState.currentState === "active") supabase.auth.startAutoRefresh();
    const appSub = AppState.addEventListener("change", (s) => {
      if (s === "active") supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      appSub.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}

/** Utilisateur connecté (à n'utiliser que sous la garde d'authentification). */
export function useUser() {
  const s = useSession();
  return useMemo(() => (s.status === "signedIn" ? s.session.user : null), [s]);
}
