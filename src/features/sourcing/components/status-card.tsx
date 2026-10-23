import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { SourcingStatusItem } from "@/services/sourcing/status-summary";
import { formatNumber } from "@/lib/format";

/** « État des sources » : chiffres calculés (catalogue, registre, base), chacun avec sa définition. */
export function SourcingStatusCard({ items, offerCountsIncomplete }: { items: SourcingStatusItem[]; offerCountsIncomplete: boolean }) {
  const groups: Array<{ title: string; scope: SourcingStatusItem["scope"] }> = [
    { title: "Catalogue et code", scope: "catalog" },
    { title: "Votre organisation", scope: "organization" },
  ];
  return (
    <Card>
      <CardHeader title="État des sources" description="Documenté ≠ vérifié ≠ connecté ≠ offre disponible. Calculé à l'instant à partir du code et de vos données." />
      <CardContent className="space-y-3">
        {groups.map((g) => (
          <div key={g.scope}>
            <div className="ms-mono text-[10.5px] leading-[14px] text-ink-3">{g.title}</div>
            <dl className="mt-1.5 divide-y divide-line-soft">
              {items
                .filter((i) => i.scope === g.scope)
                .map((i) => (
                  <div key={i.key} className="py-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <dt className="font-medium">{i.label}</dt>
                      <dd className="tnum font-semibold">{formatNumber(i.value)}</dd>
                    </div>
                    <p className="mt-0.5 text-xs leading-[16px] text-muted">
                      {i.definition}
                      {i.detail ? ` (${i.detail})` : ""}
                    </p>
                  </div>
                ))}
            </dl>
          </div>
        ))}
        {offerCountsIncomplete ? <p className="text-xs font-semibold text-warning">Comptage des offres incomplet : certaines sources n&apos;ont pas pu être comptées (base momentanément indisponible). « Avec prix » et « Avec stock » peuvent être sous-estimés.</p> : null}
      </CardContent>
    </Card>
  );
}
