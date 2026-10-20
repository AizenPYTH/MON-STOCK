import Link from "next/link";
import { ChevronRight, Package } from "lucide-react";
import type { OrgContext } from "@/features/auth/dal";
import { fetchToolsStatus } from "@/features/tools/queries";
import { LevelDot } from "@/components/instrument";

/**
 * Plateformes d'expédition (Sendcloud, Boxtal, Packlink…) : état réel lu sur le serveur
 * MON STOCK (`/tools/status`). Leur configuration se fait côté serveur ; ici on l'affiche
 * seulement, avec un accès au comparateur de frais de port. État illisible → dit tel quel.
 */
export async function ShippingPlatformsRow({ ctx }: { ctx: OrgContext }) {
  const status = await fetchToolsStatus(ctx);
  const providers = "status" in status ? status.status.shipping : [];
  const configured = providers.filter((p) => p.configured);
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-background text-muted">
        <Package aria-hidden="true" className="h-[17px] w-[17px]" />
      </span>
      <span className="min-w-0 flex-1 basis-56">
        <span className="block text-[15px] font-semibold text-foreground">{providers.length > 0 ? providers.map((p) => p.label).join(" · ") : "Plateformes d'expédition"}</span>
        <span className="block text-[12.5px] font-semibold text-ink-3">
          Devis d&apos;expédition dans Outils · configuration côté serveur par un administrateur
        </span>
      </span>
      {"error" in status ? (
        <span className="text-[13px] font-semibold text-ink-3" title={status.error}>
          État indisponible
        </span>
      ) : providers.length === 0 ? (
        <span className="text-[13px] font-semibold text-ink-3">Aucune plateforme déclarée</span>
      ) : (
        <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="État des plateformes d'expédition">
          {providers.map((p) => (
            <li key={p.id}>
              <LevelDot tone={p.configured ? "ok" : "neutral"} className={p.configured ? "text-success" : "text-ink-3"}>
                {p.label} : {p.configured ? "connecté" : "non configuré"}
              </LevelDot>
            </li>
          ))}
        </ul>
      )}
      <Link href="/tools/shipping" className="inline-flex min-h-10 items-center gap-1 rounded-[10px] border border-border-strong px-3 text-[13.5px] font-extrabold text-foreground hover:bg-line-soft">
        {configured.length > 0 ? "Comparer les frais" : "Comparateur"}
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function ShippingPlatformsRowFallback() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5" role="status" aria-live="polite">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-background text-muted">
        <Package aria-hidden="true" className="h-[17px] w-[17px]" />
      </span>
      <span className="flex-1 text-[15px] font-semibold text-foreground">Plateformes d&apos;expédition</span>
      <span className="text-[13px] font-semibold text-ink-3">Lecture de l&apos;état…</span>
    </div>
  );
}
