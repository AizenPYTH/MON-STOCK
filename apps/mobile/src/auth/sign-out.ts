import type { QueryClient } from "@tanstack/react-query";
import { getSupabase } from "~/lib/supabase";
import { securePreferences } from "~/lib/secure-store";
import { clearVoiceCache, stopSpeaking } from "~/lib/tts";
import { clearAllFavorites } from "~/data/supplier-favorites";
import { forgetAiConsent } from "~/lib/ai-consent";

/**
 * Déconnexion et purge locale UNIQUE (M-19), utilisée par Réglages, l'accueil sans organisation et
 * la suppression de compte (M-01) :
 *  1. lectures en cours annulées, mutations (en attente ou terminées) et cache TanStack vidés ;
 *  2. lecture vocale arrêtée, cache audio des réponses du conseiller supprimé ;
 *  3. favoris fournisseurs (AsyncStorage) et organisation active mémorisée effacés ;
 *  4. session Supabase retirée du trousseau (`scope: "local"` : fonctionne hors ligne).
 * `forget` (suppression de compte) efface aussi les préférences personnelles (consentement IA).
 * Chaque étape est indépendante : un échec de l'une n'empêche pas les suivantes.
 */
export async function signOutAndPurge(queryClient: QueryClient, options: { userId?: string | null; forget?: boolean } = {}): Promise<void> {
  const steps: Promise<unknown>[] = [];
  try {
    await queryClient.cancelQueries();
  } catch {
    // rien en cours
  }
  queryClient.getMutationCache().clear();
  queryClient.clear();
  steps.push(stopSpeaking().catch(() => undefined));
  steps.push(clearVoiceCache());
  steps.push(clearAllFavorites());
  if (options.userId) {
    steps.push(securePreferences.removeItem(`monstock.activeOrg.${options.userId}`).catch(() => undefined));
    if (options.forget) steps.push(forgetAiConsent(options.userId));
  }
  await Promise.all(steps);
  const supabase = getSupabase();
  if (supabase) await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
}
