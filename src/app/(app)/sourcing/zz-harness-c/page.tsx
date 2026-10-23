// FICHIER TEMPORAIRE DE VÉRIFICATION VISUELLE (groupe C) — à supprimer avant livraison.
import type { SimpleDealDTO, SimpleRankedOfferDTO, SimpleSearchDTO } from "@/features/mobile-api/contract";
import { SupplierSearchView } from "@/features/sourcing-search/components/search-results";
import { ImportProgress } from "@/features/catalog-imports/components/import-progress";
import { ImportHistory } from "@/features/catalog-imports/components/import-history";

const now = Date.now();
const iso = (h: number) => new Date(now - h * 3_600_000).toISOString();
function deal(level: SimpleDealDTO["level"], cost: number | null, market: number | null, margin: number | null, provisional = false): SimpleDealDTO {
  return { level, label: { very_good: "Très bonne affaire", good: "Bonne affaire", average: "Prix moyen", not_competitive: "Pas compétitif", insufficient_data: "Données insuffisantes" }[level], comparable: market !== null, supplierPrice: cost, marketPrice: market, marketBasis: "marketplace", marketCount: 12, discountPercent: 10, totalCost: cost, resalePrice: market, resaleBasis: "marketplace_low", margin, marginPercent: margin !== null && market ? (margin / market) * 100 : null, provisional, missingCosts: provisional ? ["emballage"] : [], uncertainties: ["Grade annoncé par le vendeur"], score: margin !== null ? 72 : null, summary: "Achat sous la médiane du marché." };
}
const offers: SimpleRankedOfferDTO[] = [
  { id: "a", title: "iPhone 13 128GB Midnight - Grade A", price: 279, currency: "EUR", priceConverted: 279, taxType: "ht", stock: "in_stock", quantity: 14, url: "https://example.com/a", seenAt: iso(3), deal: deal("very_good", 291, 389, 61), access: "account", supplierId: "00000013-0000-4000-8000-000000000001", supplierName: "Foxway", country: "EE", domain: "foxway.com" },
  { id: "b", title: "iPhone 13 128 Go Bleu reconditionné", price: 299, currency: "EUR", priceConverted: 299, taxType: "ttc", stock: "low", quantity: 2, url: "https://example.com/b", seenAt: iso(30), deal: deal("good", 305, 389, 41, true), access: "public", supplierId: "s2", supplierName: "Refreshed Apples", country: "NL", domain: "refreshedapples.com" },
  { id: "c", title: "Apple iPhone 13 128GB Starlight", price: 349, currency: "USD", priceConverted: 320.18, taxType: "unknown", stock: "unknown", quantity: null, url: null, seenAt: iso(200), deal: deal("not_competitive", 330, 330, -8), access: "marketplace", supplierId: "s3", supplierName: "eBay France", country: "FR", domain: "ebay.fr" },
  { id: "d", title: "Écran iPhone 13 OLED", price: 89, currency: "EUR", priceConverted: 89, taxType: "ht", stock: "out_of_stock", quantity: 0, url: "https://example.com/d", seenAt: null, deal: null, access: "public", supplierId: "s4", supplierName: "Brico-phone", country: "FR", domain: "brico-phone.com" },
];
const data: SimpleSearchDTO = { query: "iphone 13", currency: "EUR", total: 4, offers, suppliers: [], checked: [{ supplierName: "Foxway", ok: true, found: 1, message: null }, { supplierName: "BigBuy", ok: false, found: 0, message: "HTTP 401" }], partial: false, durationMs: 8200, missingCostSettings: ["emballage"] };

export default async function Harness({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (sp.view === "progress") {
    const base = { supplierId: null, supplierName: "Foxway", sourceId: null, origin: "file" as const, fileName: "foxway-stock-semaine-42.xlsx", fileSize: 1_482_113, format: "xlsx" as const, mode: "snapshot" as const, counts: { read: 0, valid: 0, created: 0, updated: 0, unchanged: 0, duplicates: 0, invalid: 0, rejected: 0, unrecognized: 0, expired: 0 }, truncated: false, message: null, createdBy: null, startedAt: iso(0.2), finishedAt: null };
    return (
      <div className="max-w-[900px] space-y-6 p-8">
        <ImportProgress progress={{ rowsProcessed: 2400, rowsTotal: 6120, chunksDone: 3, chunksTotal: 8 }} />
        <ImportProgress progress={{ rowsProcessed: 4000, rowsTotal: 6120, chunksDone: 5, chunksTotal: 8 }} resumable />
        <ImportProgress progress={null} />
        <ImportHistory wide jobs={[{ ...base, id: "j1", status: "running", progress: { rowsProcessed: 2400, rowsTotal: 6120, chunksDone: 3, chunksTotal: 8 }, resumable: false }, { ...base, id: "j2", status: "running", progress: { rowsProcessed: 4000, rowsTotal: 6120, chunksDone: 5, chunksTotal: 8 }, resumable: true }]} />
      </div>
    );
  }
  return <SupplierSearchView data={data} notice={sp.partial ? <p role="status">partiel</p> : undefined} />;
}
