import type { Metadata } from "next";
import { requireOrgContext } from "@/features/auth/dal";
import { fetchCostDefaults } from "@/features/tools/queries";
import { readToolView, ToolPage } from "@/features/tools/components/tool-page";
import { MarginQuick } from "@/features/tools/components/quick-tools";
import { MarginDetail } from "@/features/tools/components/profit-tools";

export const metadata: Metadata = { title: "Calculateur de marge" };

export default async function MarginToolPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const view = readToolView(await searchParams);
  const defaults = view === "detail" ? await fetchCostDefaults(ctx) : null;
  return (
    <ToolPage toolId="margin" view={view}>
      {view === "detail" ? (
        <MarginDetail defaults={defaults} />
      ) : (
        <div className="max-w-3xl">
          <MarginQuick />
        </div>
      )}
    </ToolPage>
  );
}
