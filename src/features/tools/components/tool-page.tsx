import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { findTool } from "@/domain/tools/catalog";
import { PageHeader } from "@/components/ui/page";
import { LinkTabs } from "@/components/ui/tabs";
import type { ToolView } from "@/features/tools/view";

export { readToolView, type ToolView } from "@/features/tools/view";

export function BackToTools({ href = "/tools", label = "Outils" }: { href?: string; label?: string }) {
  return (
    <Link href={href as never} className="inline-flex items-center gap-1 rounded text-xs font-medium uppercase tracking-wide text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

/** En-tête commun d'un outil du catalogue (titre et description du catalogue). */
export function ToolPage({ toolId, view, detailLabel = "Détaillé", actions, children }: { toolId: string; view?: ToolView; detailLabel?: string; actions?: ReactNode; children: ReactNode }) {
  const tool = findTool(toolId);
  const route = tool?.route ?? "/tools";
  return (
    <>
      <PageHeader eyebrow={<BackToTools />} title={tool?.title ?? "Outil"} description={tool?.description} actions={actions} />
      {view ? (
        <LinkTabs
          label="Version du calculateur"
          current={view === "detail" ? `${route}?vue=detail` : route}
          items={[
            { href: route, label: "Version simple" },
            { href: `${route}?vue=detail`, label: detailLabel },
          ]}
        />
      ) : null}
      {children}
    </>
  );
}
