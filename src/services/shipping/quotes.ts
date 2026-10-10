import "server-only";
import type { ShippingProviderStatusDTO, ShippingQuoteDTO, ShippingQuoteRequest, ShippingQuotesDTO } from "@/features/mobile-api/contract";
import { isConnectorError } from "@/integrations/core/errors";
import { boxtalConfigured, boxtalQuotes } from "@/integrations/shipping/boxtal";
import { packlinkConfigured, packlinkQuotes } from "@/integrations/shipping/packlink";
import { createLogger } from "@/lib/logger";

const log = createLogger("SHIPPING");

/**
 * Devis d'expédition réels auprès des plateformes connectées (en parallèle). Sans plateforme
 * configurée : aucun prix, et l'application propose la grille saisie par l'utilisateur.
 */
const PROVIDERS = [
  { id: "packlink" as const, label: "Packlink PRO", configured: packlinkConfigured, quote: packlinkQuotes },
  { id: "boxtal" as const, label: "Boxtal", configured: boxtalConfigured, quote: boxtalQuotes },
];

export function shippingProvidersStatus(env: Record<string, string | undefined> = process.env): { id: string; label: string; configured: boolean }[] {
  return PROVIDERS.map((p) => ({ id: p.id, label: p.label, configured: p.configured(env) }));
}

export async function quoteShipping(req: ShippingQuoteRequest, env: Record<string, string | undefined> = process.env, now: Date = new Date()): Promise<ShippingQuotesDTO> {
  const results = await Promise.all(
    PROVIDERS.map(async (p): Promise<{ status: ShippingProviderStatusDTO; quotes: ShippingQuoteDTO[] }> => {
      if (!p.configured(env)) return { status: { id: p.id, label: p.label, state: "not_configured", message: "Non configuré sur le serveur.", count: 0 }, quotes: [] };
      try {
        const quotes = await p.quote(req, env, now);
        return { status: { id: p.id, label: p.label, state: quotes.length ? "ok" : "no_result", message: quotes.length ? null : "Aucun service proposé pour ce colis et ce trajet.", count: quotes.length }, quotes };
      } catch (e) {
        const message = isConnectorError(e) ? e.message : "Erreur inattendue.";
        log.warn("devis d'expédition en échec", { provider: p.id, error: message });
        return { status: { id: p.id, label: p.label, state: "error", message, count: 0 }, quotes: [] };
      }
    }),
  );
  return { quotes: results.flatMap((r) => r.quotes), providers: results.map((r) => r.status), quotedAt: now.toISOString() };
}
