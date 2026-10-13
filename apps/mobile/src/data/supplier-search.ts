import type { SimpleSearchDTO } from "@/features/mobile-api/contract";
import { callApi } from "~/lib/api";

export type { SimpleOfferDTO, SimpleRankedOfferDTO, SimpleSearchDTO, SimpleSupplierResultDTO } from "@/features/mobile-api/contract";

/** Recherche « Fournisseurs » : offres trouvées chez chaque fournisseur, du moins cher au plus cher. */
export function searchSuppliers(organizationId: string, q: string): Promise<SimpleSearchDTO> {
  return callApi<SimpleSearchDTO>("/suppliers/search", { organizationId, query: { q: q.trim() }, timeoutMs: 75_000 });
}

export const STOCK_TEXT: Record<"in_stock" | "low" | "out_of_stock" | "unknown", string> = {
  in_stock: "En stock",
  low: "Stock faible",
  out_of_stock: "En rupture",
  unknown: "Stock non indiqué",
};
