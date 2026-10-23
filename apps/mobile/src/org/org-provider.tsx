import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "~/auth/session-provider";
import { requireSupabase } from "~/lib/supabase";
import { securePreferences } from "~/lib/secure-store";
import { loadMemberships, permissionsFor, pickActiveOrganization, syncProfileOrganization, type Membership, type OrgPermissions } from "~/org/org-service";

export type OrgState =
  | { status: "loading" }
  | { status: "error"; error: unknown; retry: () => void }
  | { status: "none"; refresh: () => Promise<void> }
  | {
      status: "ready";
      active: Membership;
      permissions: OrgPermissions;
      memberships: Membership[];
      /** organisation active du compte côté site web (profil) ; null si aucune */
      profileOrgId: string | null;
      /** change l'organisation de cet appareil ET celle du profil (site web) ; `synced` = profil mis à jour */
      setActive: (organizationId: string) => Promise<{ synced: boolean }>;
      refresh: () => Promise<void>;
    };

const OrgContext = createContext<OrgState>({ status: "loading" });

const storageKey = (userId: string) => `monstock.activeOrg.${userId}`;

/**
 * Organisation active de l'application mobile (M-05). Mémorisée sur l'appareil (par utilisateur) ;
 * un changement fait sur le téléphone est AUSSI écrit dans le profil (user_profiles.
 * current_organization_id, même règle que le site web, vérifiée par la base) pour que le téléphone
 * et le site affichent la même organisation. Chaque requête filtre en plus par organization_id ;
 * la RLS garantit qu'aucune autre organisation n'est lisible.
 */
export function OrgProvider({ children }: { children: ReactNode }) {
  const user = useUser();
  const queryClient = useQueryClient();
  // Choix mémorisé, attaché à l'utilisateur qui l'a lu (M-26 : jamais réutilisé pour un autre).
  const [stored, setStored] = useState<{ userId: string; value: string | null } | null>(null);

  const userId = user?.id ?? null;
  const storedId = stored && stored.userId === userId ? stored.value : undefined;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    securePreferences
      .getItem(storageKey(userId))
      .then((v) => alive && setStored({ userId, value: v }))
      .catch(() => alive && setStored({ userId, value: null }));
    return () => {
      alive = false;
    };
  }, [userId]);

  const query = useQuery({
    queryKey: ["memberships", user?.id],
    queryFn: () => loadMemberships(requireSupabase(), user!.id),
    enabled: Boolean(user),
  });

  const setActive = useCallback(
    async (organizationId: string) => {
      if (!user) return { synced: false };
      await securePreferences.setItem(storageKey(user.id), organizationId).catch(() => undefined);
      setStored({ userId: user.id, value: organizationId });
      // Les données de l'organisation précédente ne doivent jamais s'afficher dans la nouvelle.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "memberships" });
      const synced = await syncProfileOrganization(requireSupabase(), user.id, organizationId);
      if (synced) void queryClient.invalidateQueries({ queryKey: ["memberships", user.id] });
      return { synced };
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
    return { status: "ready", active, permissions: permissionsFor(active.role), memberships, profileOrgId, setActive, refresh };
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
