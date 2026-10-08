import type { SourceAdapter } from "@/integrations/sourcing/core";

/**
 * Registre des adaptateurs de source. Chaque adaptateur vit dans son dossier
 * (src/integrations/sourcing/<key>/) et s'enregistre ici. Un adaptateur absent de ce
 * tableau n'est jamais proposé dans l'interface.
 */
export const SOURCE_ADAPTERS: readonly SourceAdapter[] = [];

export function listSourceAdapters(): readonly SourceAdapter[] {
  return SOURCE_ADAPTERS;
}

export function getSourceAdapter(key: string | null | undefined): SourceAdapter | null {
  if (!key) return null;
  return SOURCE_ADAPTERS.find((a) => a.key === key) ?? null;
}
