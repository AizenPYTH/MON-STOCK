import type { Metadata } from "next";
import { requireOrgContext } from "@/features/auth/dal";
import { fetchCostDefaults } from "@/features/tools/queries";
import { readToolView, ToolPage } from "@/features/tools/components/tool-page";
import { EbayFeesQuick } from "@/features/tools/components/quick-tools";
import { EbayFeesDetail } from "@/features/tools/components/detail-tools";

export const metadata: Metadata = { title: "Calculateur de frais eBay" };

export default async function EbayFeesToolPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const view = readToolView(await searchParams);
  const defaults = await fetchCostDefaults(ctx);
  const channel = defaults?.ebayChannel ?? null;
  return (
    <ToolPage toolId="ebay-fees" view={view}>
      {view === "detail" ? (
        <EbayFeesDetail channel={channel} />
      ) : (
        <div className="max-w-3xl">
          <EbayFeesQuick channelRate={channel?.fee_percent ?? null} />
        </div>
      )}
    </ToolPage>
  );
}
