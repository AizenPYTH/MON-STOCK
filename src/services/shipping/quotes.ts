import "server-only";
import type { ShippingProviderStatusDTO, ShippingQuoteDTO, ShippingQuoteRequest, ShippingQuotesDTO } from "@/features/mobile-api/contract";
import { isConnectorError } from "@/integrations/core/errors";
import { boxtalConfigured, boxtalQuotes } from "@/integrations/shipping/boxtal";
import { packlinkConfigured, packlinkQuotes } from "@/integrations/shipping/packlink";
import { sendcloudConfigured, sendcloudQuotes } from "@/integrations/shipping/sendcloud";
import { createLogger } from "@/lib/logger";

const log = createLogger("SHIPPING");

type Env = Record<string, string | undefined>;

interface Provider {
  id: ShippingProviderStatusDTO["id"];
  label: string;
  configured: (env: Env) => boolean;
  /** devis réels ; `excluded` = offres renvoyées mais écartées (prix nul, non suivi, incomplet) */
  quote: (req: ShippingQuoteRequest, env: Env, now: Date) => Promise<{ quotes: ShippingQuoteDTO[]; excluded: number }>;
}

/**
 * Devis d'expédition réels auprès des plateformes connectées (en parallèle). Sans plateforme
 * configurée : aucun prix, et l'application propose la grille saisie par l'utilisateur.
 * Consultation uniquement : aucune étiquette ni aucun envoi n'est jamais créé ici.
 */
const PROVIDERS: Provider[] = [
  { id: "packlink", label: "Packlink PRO", configured: packlinkConfigured, quote: async (req, env, now) => ({ quotes: await packlinkQuotes(req, env, now), excluded: 0 }) },
  { id: "boxtal", label: "Boxtal", configured: boxtalConfigured, quote: async (req, env, now) => ({ quotes: await boxtalQuotes(req, env, now), excluded: 0 }) },
  {
    id: "sendcloud",
    label: "Sendcloud",
    configured: sendcloudConfigured,
    quote: async (req, env, now) => {
      const r = await sendcloudQuotes(req, env, now);
      return { quotes: r.quotes, excluded: r.excluded.length };
    },
  },
];

function excludedNote(n: number): string | null {
  return n > 0 ? `${n} offre${n > 1 ? "s" : ""} écartée${n > 1 ? "s" : ""} (prix nul ou absent, envoi non suivi ou réponse incomplète).` : null;
}

export function shippingProvidersStatus(env: Env = process.env): { id: string; label: string; configured: boolean }[] {
  return PROVIDERS.map((p) => ({ id: p.id, label: p.label, configured: p.configured(env) }));
}

export async function quoteShipping(req: ShippingQuoteRequest, env: Env = process.env, now: Date = new Date()): Promise<ShippingQuotesDTO> {
  const results = await Promise.all(
    PROVIDERS.map(async (p): Promise<{ status: ShippingProviderStatusDTO; quotes: ShippingQuoteDTO[] }> => {
      if (!p.configured(env)) return { status: { id: p.id, label: p.label, state: "not_configured", message: "Non configuré sur le serveur.", count: 0 }, quotes: [] };
      try {
        const { quotes, excluded } = await p.quote(req, env, now);
        const note = excludedNote(excluded);
        const message = quotes.length ? note : ["Aucun service proposé pour ce colis et ce trajet.", note].filter(Boolean).join(" ");
        return { status: { id: p.id, label: p.label, state: quotes.length ? "ok" : "no_result", message, count: quotes.length }, quotes };
      } catch (e) {
        const message = isConnectorError(e) ? e.message : "Erreur inattendue.";
        log.warn("devis d'expédition en échec", { provider: p.id, error: message });
        return { status: { id: p.id, label: p.label, state: "error", message, count: 0 }, quotes: [] };
      }
    }),
  );
  return { quotes: results.flatMap((r) => r.quotes), providers: results.map((r) => r.status), quotedAt: now.toISOString() };
}
