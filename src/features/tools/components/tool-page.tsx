import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { findTool } from "@/domain/tools/catalog";
import { Paper, Scene, SceneHeader, Segmented } from "@/components/instrument";
import type { ToolView } from "@/features/tools/view";

export { readToolView, type ToolView } from "@/features/tools/view";

/** Lien de retour discret (posé sur le papier). */
export function BackToTools({ href = "/tools", label = "Outils" }: { href?: string; label?: string }) {
  return (
    <Link href={href as never} className="inline-flex items-center gap-1 rounded text-xs font-medium uppercase tracking-wide text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

/**
 * Écran d'un outil (v5) : scène nuit (retour, titre, description, actions) puis papier. Les
 * actions posées sur la scène utilisent les variantes « primary » (menthe) ou « night ».
 */
export function ToolScreen({
  title,
  description,
  back = { href: "/tools", label: "Outils" },
  eyebrow,
  actions,
  toolbar,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** commandes en tête du papier (version simple / détaillée, onglets…) */
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <Scene>
        <SceneHeader back={back} eyebrow={eyebrow} title={title} description={description} actions={actions} />
      </Scene>
      <Paper>
        {toolbar ? <div className="mb-5 flex flex-wrap items-center gap-3">{toolbar}</div> : null}
        {children}
      </Paper>
    </>
  );
}

/** Écran commun d'un outil du catalogue (titre et description du catalogue, version simple / détaillée). */
export function ToolPage({ toolId, view, detailLabel = "Détaillé", actions, children }: { toolId: string; view?: ToolView; detailLabel?: string; actions?: ReactNode; children: ReactNode }) {
  const tool = findTool(toolId);
  const route = tool?.route ?? "/tools";
  return (
    <ToolScreen
      title={tool?.title ?? "Outil"}
      description={tool?.description}
      actions={actions}
      toolbar={
        view ? (
          <Segmented
            label="Version du calculateur"
            options={[
              { href: route, label: "Version simple", selected: view === "simple" },
              { href: `${route}?vue=detail`, label: detailLabel, selected: view === "detail" },
            ]}
          />
        ) : null
      }
    >
      {children}
    </ToolScreen>
  );
}
