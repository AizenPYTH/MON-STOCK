import type { InventoryMovement } from "@/db/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  initial: "Stock initial",
  receipt: "Réception",
  sale: "Vente",
  return: "Retour",
  cancellation: "Annulation",
  adjustment: "Ajustement",
  transfer_in: "Transfert entrant",
  transfer_out: "Transfert sortant",
  correction: "Correction",
};

const CHANNEL_LABEL: Record<string, string> = { ebay: "eBay", amazon: "Amazon", shopify: "Shopify", woocommerce: "WooCommerce", manual: "manuel" };

/**
 * Historique des mouvements (v5) : type, date · canal · note · stock après, quantité signée
 * (vert en entrée, rouge en sortie). Historique non supprimable : affichage seul.
 */
export function MovementsTimeline({ movements, limit, className }: { movements: InventoryMovement[]; limit?: number; className?: string }) {
  if (movements.length === 0) return <p className={cn("px-4 py-3.5 text-sm font-medium text-muted", className)}>Aucun mouvement enregistré.</p>;
  const shown = limit ? movements.slice(0, limit) : movements;
  return (
    <ol className={cn("divide-y divide-line-soft", className)}>
      {shown.map((m) => {
        const sub = [formatDateTime(m.occurred_at), m.channel ? CHANNEL_LABEL[m.channel] ?? m.channel : null, m.note, `stock après : ${m.quantity_after}`].filter(Boolean).join(" · ");
        return (
          <li key={m.id} className="flex min-h-[58px] items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-semibold leading-5">{TYPE_LABEL[m.type] ?? m.type}</div>
              <div className="truncate text-[12.5px] font-semibold leading-[17px] text-ink-3" title={sub}>
                {sub}
              </div>
            </div>
            <span className={cn("shrink-0 text-[15px] font-extrabold leading-5 tnum", m.quantity > 0 ? "text-success" : m.quantity < 0 ? "text-danger" : "text-muted")}>
              {m.quantity > 0 ? "+" : m.quantity < 0 ? "−" : ""}
              {Math.abs(m.quantity)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
