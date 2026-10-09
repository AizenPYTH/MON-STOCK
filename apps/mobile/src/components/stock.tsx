import { View } from "react-native";
import type { StockRowView } from "@/features/stock/model";
import { useStockStepper } from "~/hooks/use-stock-stepper";
import { formatNumber } from "~/lib/format";
import { Card, Stepper, Txt } from "~/components/ui";
import { space } from "~/theme/tokens";

const CONDITION: Record<string, string> = { new: "Neuf", refurbished: "Reconditionné", used: "Occasion", unknown: "État non précisé" };

export function variantTitle(v: StockRowView): string {
  const name = v.row.variant_name && v.row.variant_name !== "Standard" ? v.row.variant_name : "Standard";
  const cond = v.row.grade ? `Grade ${v.row.grade}` : v.row.condition ? CONDITION[v.row.condition] : null;
  return cond && !name.includes(cond) ? `${name} · ${cond}` : name;
}

/** Quantité en stock + seuil d'alerte, avec stepper qui persiste chaque ajustement (mouvement réel). */
export function QuantityCard({ view, canWrite }: { view: StockRowView; canWrite: boolean }) {
  const onHand = view.row.quantity_on_hand ?? 0;
  const stepper = useStockStepper(view.row.sku_id ?? "", onHand);
  const reserved = view.row.quantity_reserved ?? 0;
  return (
    <Card padded>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flexShrink: 1 }}>
          <Txt variant="body" style={{ fontFamily: "Manrope_700Bold" }}>
            Quantité en stock
          </Txt>
          <Txt variant="label">
            Seuil d'alerte : {formatNumber(view.row.reorder_point ?? 0)}
            {reserved > 0 ? ` · ${formatNumber(reserved)} réservée${reserved > 1 ? "s" : ""}` : ""}
          </Txt>
        </View>
        {canWrite ? (
          <Stepper value={stepper.value} onChange={stepper.onChange} busy={stepper.busy} />
        ) : (
          <Txt variant="title2" num style={{ fontSize: 24 }}>
            {formatNumber(onHand)}
          </Txt>
        )}
      </View>
      {!canWrite ? <Txt variant="label" style={{ marginTop: space[2] }}>Lecture seule : votre rôle ne permet pas de modifier le stock.</Txt> : null}
    </Card>
  );
}
