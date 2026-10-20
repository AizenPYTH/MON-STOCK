import { requireOrgContext } from "@/features/auth/dal";
import { flattenParams, parseStockWebParams } from "@/features/stock-web/params";
import { loadStockExport } from "@/features/stock-web/queries";
import { stockCsv } from "@/features/stock-web/list.pure";

/**
 * Export CSV du stock (lecture seule, droits de l'utilisateur via la RLS) : la liste filtrée de
 * l'écran Stock, ou la sélection (`codes=A,B,C`). Valeur inconnue = cellule vide, jamais 0.
 */
export async function GET(request: Request) {
  const ctx = await requireOrgContext();
  const url = new URL(request.url);
  const raw: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    if (!(k in raw)) raw[k] = v;
  });
  const flat = flattenParams(raw);
  const codes = flat.codes ? flat.codes.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 500) : null;
  delete flat.codes;
  const params = parseStockWebParams(flat);
  const { views } = await loadStockExport(ctx, params, codes);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(stockCsv(views), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="stock-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
