import type { Metadata } from "next";
import { requireOrgContext } from "@/features/auth/dal";
import { readToolView, ToolPage } from "@/features/tools/components/tool-page";
import { DiscountQuick } from "@/features/tools/components/quick-tools";
import { DiscountDetail } from "@/features/tools/components/detail-tools";

export const metadata: Metadata = { title: "Calculateur de remise" };

export default async function DiscountToolPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOrgContext();
  const view = readToolView(await searchParams);
  return (
    <ToolPage toolId="discount" view={view}>
      {view === "detail" ? (
        <DiscountDetail />
      ) : (
        <div className="max-w-3xl">
          <DiscountQuick />
        </div>
      )}
    </ToolPage>
  );
}
