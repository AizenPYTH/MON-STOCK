import type { Metadata } from "next";
import { requireOrgContext } from "@/features/auth/dal";
import { ToolPage } from "@/features/tools/components/tool-page";
import { VatTool } from "@/features/tools/components/vat-tool";

export const metadata: Metadata = { title: "Calculateur de TVA" };

export default async function VatToolPage() {
  await requireOrgContext();
  return (
    <ToolPage toolId="vat">
      <div className="max-w-3xl">
        <VatTool />
      </div>
    </ToolPage>
  );
}
