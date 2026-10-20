import type { Metadata } from "next";
import Link from "next/link";
import { toolsByCategory, toolTiles } from "@/domain/tools/catalog";
import { requireOrgContext } from "@/features/auth/dal";
import { PageHeader } from "@/components/ui/page";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Outils" };

/**
 * « Outils » : les tuiles du catalogue (TVA · Marge · Prix · Frais eBay · Remise · Devises · Port ·
 * Colis), regroupées par usage sur grand écran. Chaque outil a sa propre route.
 */
export default async function ToolsPage() {
  await requireOrgContext();
  const tiles = toolTiles();
  const groups = toolsByCategory(tiles);
  return (
    <>
      <PageHeader title="Outils" description="Calculateurs du revendeur (calcul exact, instantané), comparateur de frais de port et suivi de colis." />
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.category} aria-labelledby={`tools-${g.category}`} className="space-y-3">
            <h2 id={`tools-${g.category}`} className="text-sm font-semibold uppercase tracking-wide text-muted">
              {g.label}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {g.tools.map((t) => {
                const tile = tiles.find((x) => x.id === t.id)!.tile;
                const dark = Boolean(tile.dark);
                return (
                  <li key={t.id}>
                    <Link
                      href={t.route as never}
                      className={cn(
                        "flex h-full min-h-36 flex-col justify-between gap-4 rounded-2xl border p-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        dark ? "border-transparent bg-night text-on-night hover:bg-night-raised" : "border-border bg-surface text-foreground hover:bg-surface-muted",
                      )}
                    >
                      <span aria-hidden="true" className="text-3xl font-bold tracking-tight">
                        {tile.glyph}
                      </span>
                      <span>
                        <span className="block text-base font-extrabold">{tile.label}</span>
                        <span className={cn("mt-0.5 block text-sm", dark ? "text-on-night-muted" : "text-muted")}>{t.description}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
