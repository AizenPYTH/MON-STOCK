import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "~/auth/session-provider";
import { requireSupabase } from "~/lib/supabase";
import { securePreferences } from "~/lib/secure-store";
import { loadMemberships, permissionsFor, pickActiveOrganization, type Membership, type OrgPermissions } from "~/org/org-service";

export type OrgState =
  | { status: "loading" }
  | { status: "error"; error: unknown; retry: () => void }
  | { status: "none"; refresh: () => Promise<void> }
  | {
      status: "ready";
      active: Membership;
      permissions: OrgPermissions;
      memberships: Membership[];
      setActive: (organizationId: string) => Promise<void>;
      refresh: () => Promise<void>;
    };

const OrgContext = createContext<OrgState>({ status: "loading" });

const storageKey = (userId: string) => `monstock.activeOrg.${userId}`;

/**
 * Organisation active de l'application mobile. Mémorisée sur l'appareil (par utilisateur),
 * sans modifier l'organisation active de l'application web. Chaque requête filtre en plus
 * par organization_id ; la RLS garantit qu'aucune autre organisation n'est lisible.
 */
export function OrgProvider({ children }: { children: ReactNode }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const [storedId, setStoredId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    securePreferences
      .getItem(storageKey(user.id))
      .then((v) => alive && setStoredId(v))
      .catch(() => alive && setStoredId(null));
    return () => {
      alive = false;
    };
  }, [user]);

  const query = useQuery({
    queryKey: ["memberships", user?.id],
    queryFn: () => loadMemberships(requireSupabase(), user!.id),
    enabled: Boolean(user),
  });

  const setActive = useCallback(
    async (organizationId: string) => {
      if (!user) return;
      await securePreferences.setItem(storageKey(user.id), organizationId);
      setStoredId(organizationId);
      // Les données de l'organisation précédente ne doivent jamais s'afficher dans la nouvelle.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "memberships" });
    },
    [user, queryClient],
  );

  const refresh = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const value = useMemo<OrgState>(() => {
    if (!user || storedId === undefined || query.isPending) return { status: "loading" };
    if (query.isError) return { status: "error", error: query.error, retry: () => void query.refetch() };
    const { memberships, profileOrgId } = query.data;
    const active = pickActiveOrganization(memberships, storedId, profileOrgId);
    if (!active) return { status: "none", refresh };
    return { status: "ready", active, permissions: permissionsFor(active.role), memberships, setActive, refresh };
  }, [user, storedId, query, setActive, refresh]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgState {
  return useContext(OrgContext);
}

/** Organisation active (sous la garde d'organisation uniquement). */
export function useActiveOrg(): Extract<OrgState, { status: "ready" }> {
  const s = useOrg();
  if (s.status !== "ready") throw new Error("Organisation active indisponible.");
  return s;
}
