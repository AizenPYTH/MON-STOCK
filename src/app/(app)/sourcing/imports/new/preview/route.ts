import { handleCatalogRequest } from "@/features/catalog-imports/upload";

/** Aperçu d'un catalogue fournisseur (rien n'est enregistré) — équivalent de POST /sourcing/import/preview (Edge). */
export const maxDuration = 90;

export async function POST(request: Request) {
  return handleCatalogRequest(request, "preview");
}
