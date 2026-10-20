import type { Metadata } from "next";
import { requireOrgContext } from "@/features/auth/dal";
import { fetchCostDefaults } from "@/features/tools/queries";
import { readToolView, ToolPage } from "@/features/tools/components/tool-page";
import { SellingPriceQuick } from "@/features/tools/components/quick-tools";
import { SellingPriceDetail } from "@/features/tools/components/profit-tools";

export const metadata: Metadata = { title: "Calculateur de prix de vente" };

export default async function SellingPriceToolPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const view = readToolView(await searchParams);
  const defaults = view === "detail" ? await fetchCostDefaults(ctx) : null;
  return (
    <ToolPage toolId="selling-price" view={view}>
      {view === "detail" ? (
        <SellingPriceDetail defaults={defaults} />
      ) : (
        <div className="max-w-3xl">
          <SellingPriceQuick />
        </div>
      )}
    </ToolPage>
  );
}
