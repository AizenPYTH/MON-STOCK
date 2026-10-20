import { handleCatalogRequest } from "@/features/catalog-imports/upload";

/** Import réel d'un catalogue fournisseur (rédacteur) — équivalent de POST /sourcing/import (Edge). */
export const maxDuration = 180;

export async function POST(request: Request) {
  return handleCatalogRequest(request, "import");
}
