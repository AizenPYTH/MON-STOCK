import { Ban, CircleHelp, Clock, CreditCard, PackageCheck, RotateCcw, Truck, Undo2, Unlink, type LucideIcon } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { ORDER_STATUS_LABEL } from "@/features/analytics/labels";
import { cn } from "@/lib/utils";

/**
 * Statut d'une commande lisible sans la couleur (icône + texte) : en attente (action requise),
 * payée (à expédier), expédiée, livrée (terminée), annulée, remboursée. Purement visuel : le statut
 * vient tel quel de la commande importée.
 */
const ORDER_STATUS_UI: Record<string, { tone: StatusTone; icon: LucideIcon }> = {
  pending: { tone: "warning", icon: Clock },
  paid: { tone: "info", icon: CreditCard },
  shipped: { tone: "info", icon: Truck },
  delivered: { tone: "success", icon: PackageCheck },
  cancelled: { tone: "neutral", icon: Ban },
  refunded: { tone: "danger", icon: Undo2 },
  unknown: { tone: "neutral", icon: CircleHelp },
};

export function OrderStatusBadge({ status, size = "sm", variant = "soft" }: { status: string; size?: "sm" | "md"; variant?: "soft" | "plain" }) {
  const ui = ORDER_STATUS_UI[status] ?? ORDER_STATUS_UI.unknown!;
  const Icon = ui.icon;
  return (
    <StatusBadge tone={ui.tone} size={size} variant={variant} icon={<Icon strokeWidth={2.25} />}>
      {ORDER_STATUS_LABEL[status] ?? status}
    </StatusBadge>
  );
}

const STEPS = [
  { key: "pending", label: "Reçue" },
  { key: "paid", label: "Payée" },
  { key: "shipped", label: "Expédiée" },
  { key: "delivered", label: "Livrée" },
] as const;

/**
 * Étapes de traitement déduites du seul statut actuel (aucune date inventée) : reçue → payée →
 * expédiée → livrée. Annulée / remboursée : parcours interrompu, signalé à part.
 */
export function OrderSteps({ status, className }: { status: string; className?: string }) {
  const index = STEPS.findIndex((s) => s.key === status);
  const stopped = status === "cancelled" || status === "refunded";
  const unknown = index < 0 && !stopped;
  return (
    <div className={cn("min-w-0", className)}>
      <ol aria-label="Étapes de traitement" className="grid grid-cols-4 gap-1.5">
        {STEPS.map((s, i) => {
          const done = !stopped && !unknown && i <= index;
          const current = !stopped && !unknown && i === index;
          return (
            <li key={s.key} aria-current={current ? "step" : undefined} className="min-w-0">
              <span aria-hidden="true" className={cn("block h-1 rounded-full", done ? (status === "delivered" ? "bg-success-strong" : "bg-on-night") : "bg-night-stroke")} />
              <span className={cn("mt-1.5 block truncate text-[12px] font-semibold leading-4", current ? "text-on-night" : done ? "text-on-night-muted" : "text-on-night-subtle")}>
                {s.label}
                <span className="sr-only">{current ? " (étape actuelle)" : done ? " (faite)" : " (à venir)"}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {stopped ? <p className="mt-2 text-[12.5px] font-semibold text-on-night-muted">Parcours interrompu : commande {status === "refunded" ? "remboursée" : "annulée"}.</p> : null}
      {unknown ? <p className="mt-2 text-[12.5px] font-semibold text-on-night-muted">Statut non communiqué par le canal : étape inconnue.</p> : null}
    </div>
  );
}

export type InventoryState = "void" | "none" | "unmapped" | "pending" | "applied" | "partial";

/** Effet de la commande sur le stock (colonne « Stock » de la liste des ventes). */
export function InventoryStatus({ state, pendingCount }: { state: InventoryState; pendingCount?: number }) {
  switch (state) {
    case "void":
      return (
        <StatusBadge tone="neutral" variant="plain" icon={<RotateCcw />}>
          Recrédité / sans effet
        </StatusBadge>
      );
    case "none":
      return <span aria-label="aucune ligne" className="text-muted">—</span>;
    case "unmapped":
      return (
        <StatusBadge tone="warning" variant="plain" icon={<Unlink />}>
          Non associée
        </StatusBadge>
      );
    case "pending":
      return (
        <StatusBadge tone="warning" variant="plain">
          Non déduit ({pendingCount ?? 0})
        </StatusBadge>
      );
    case "applied":
      return (
        <StatusBadge tone="success" variant="plain">
          Déduit
        </StatusBadge>
      );
    default:
      return (
        <StatusBadge tone="neutral" variant="plain">
          Partiel
        </StatusBadge>
      );
  }
}
