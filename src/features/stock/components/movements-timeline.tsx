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

export function MovementsTimeline({ movements }: { movements: InventoryMovement[] }) {
  if (movements.length === 0) return <p className="text-sm text-muted">Aucun mouvement enregistré.</p>;
  return (
    <ol className="divide-y divide-border">
      {movements.map((m) => (
        <li key={m.id} className="flex items-start gap-3 py-2.5 text-sm">
          <span className={cn("w-14 shrink-0 text-right font-semibold tnum", m.quantity > 0 ? "text-success" : "text-danger")}>
            {m.quantity > 0 ? "+" : ""}
            {m.quantity}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              {TYPE_LABEL[m.type] ?? m.type}
              {m.channel ? <span className="text-muted"> · {CHANNEL_LABEL[m.channel] ?? m.channel}</span> : null}
            </div>
            {m.note ? <div className="truncate text-xs text-muted">{m.note}</div> : null}
          </div>
          <div className="shrink-0 text-right text-xs text-muted">
            <div>{formatDateTime(m.occurred_at)}</div>
            <div>→ {m.quantity_after}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
