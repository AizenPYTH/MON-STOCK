import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { listSourcingAlerts, getSourcingAlert, parseCriteria } from "@/features/sourcing/queries";
import { AlertForm, type AlertFormValues } from "@/features/sourcing/components/alert-form";
import { EvaluateAlertsButton } from "@/features/sourcing/components/evaluate-alerts-button";
import { deleteAlertAction, markAlertEventsSeenAction, toggleAlertAction } from "@/features/sourcing/actions";
import { formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import { EVENT_KIND_LABEL } from "@/features/sourcing/labels";

export const metadata: Metadata = { title: "Alertes de sourcing" };

export default async function SourcingAlertsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const writable = canWrite(ctx.role);
  const currency = ctx.organization.default_currency;
  const editId = get("edit");
  const showNew = get("new") === "1";
  const [alerts, editing] = await Promise.all([listSourcingAlerts(ctx), editId ? getSourcingAlert(ctx, editId) : Promise.resolve(null)]);

  let formValues: AlertFormValues | null = null;
  if (writable && editing) {
    const c = parseCriteria(editing.criteria);
    formValues = { alert_id: editing.id, name: editing.name, query_text: editing.query_text, max_price: c.max_price ?? null, min_quantity: c.min_quantity ?? null, countries: c.countries?.join(", ") ?? "", max_moq: c.max_moq ?? null, grades: c.grades?.join(", ") ?? "", condition: c.condition ?? "", max_delivery_days: c.max_delivery_days ?? null, sku_id: editing.sku_id };
  } else if (writable && showNew) {
    const num = (k: string) => (get(k) && Number.isFinite(Number(get(k))) ? Number(get(k)) : null);
    formValues = { name: get("q") ? `${get("q")}${get("max_price") ? ` sous ${formatMoney(Number(get("max_price")), currency)}` : ""}` : "", query_text: get("q") ?? "", max_price: num("max_price"), min_quantity: num("min_quantity"), countries: get("countries") ?? "", max_moq: num("max_moq"), grades: get("grades") ?? "", condition: get("condition") ?? "", max_delivery_days: num("max_delivery_days"), sku_id: get("sku_id") ?? null };
  }
  const totalUnseen = alerts.reduce((s, a) => s + a.unseenCount, 0);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/sourcing" className="hover:text-foreground">
            Sourcing
          </Link>
        }
        title="Alertes de sourcing"
        description="Soyez prévenu quand une offre passe sous votre seuil, qu'un prix baisse ou qu'un stock revient. Les alertes sont évaluées à chaque synchronisation (cron) ou à la demande."
        actions={
          writable ? (
            <>
              <EvaluateAlertsButton />
              {totalUnseen > 0 ? (
                <form action={markAlertEventsSeenAction}>
                  <Button type="submit" variant="ghost">
                    Tout marquer comme vu ({totalUnseen})
                  </Button>
                </form>
              ) : null}
              <ButtonLink href="/sourcing/alerts?new=1">
                <Plus className="h-4 w-4" /> Nouvelle alerte
              </ButtonLink>
            </>
          ) : null
        }
      />
      <div className="space-y-6">
        {formValues ? <AlertForm initial={formValues} currency={currency} /> : null}
        {alerts.length === 0 && !formValues ? (
          <EmptyState title="Aucune alerte." description="Créez une alerte depuis une recherche (« Créer une alerte pour cette recherche ») ou ici." action={writable ? <ButtonLink href="/sourcing/alerts?new=1">Créer une alerte</ButtonLink> : undefined} />
        ) : (
          alerts.map((a) => {
            const c = a.criteria;
            const crit = [
              c.max_price !== undefined ? `prix ≤ ${formatMoney(c.max_price, currency)}` : null,
              c.min_quantity !== undefined ? `stock ≥ ${c.min_quantity}` : null,
              c.countries ? `pays ${c.countries.join("/")}` : null,
              c.max_moq !== undefined ? `MOQ ≤ ${c.max_moq}` : null,
              c.grades ? `grade ${c.grades.join("/")}` : null,
              c.condition ? `état ${c.condition}` : null,
              c.max_delivery_days !== undefined ? `délai ≤ ${c.max_delivery_days} j` : null,
            ].filter(Boolean);
            return (
              <Card key={a.id}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {a.name}
                      <Badge variant={a.is_active ? "success" : "neutral"}>{a.is_active ? "Active" : "En pause"}</Badge>
                      {a.unseenCount > 0 ? <Badge variant="danger">{a.unseenCount} nouveau(x)</Badge> : null}
                    </span>
                  }
                  description={
                    <span>
                      « {a.query_text} »{a.sku ? ` · SKU ${a.sku.code}` : ""} · {crit.length > 0 ? crit.join(" · ") : "aucun critère de seuil"} · dernière évaluation {a.last_checked_at ? formatRelative(a.last_checked_at) : "jamais"}
                    </span>
                  }
                  actions={
                    writable ? (
                      <div className="flex flex-wrap gap-1">
                        <ButtonLink href={`/sourcing/alerts?edit=${a.id}`} variant="ghost" size="sm">
                          Modifier
                        </ButtonLink>
                        <form action={toggleAlertAction}>
                          <input type="hidden" name="alert_id" value={a.id} />
                          <input type="hidden" name="active" value={a.is_active ? "false" : "true"} />
                          <Button type="submit" variant="ghost" size="sm">
                            {a.is_active ? "Mettre en pause" : "Réactiver"}
                          </Button>
                        </form>
                        {a.unseenCount > 0 ? (
                          <form action={markAlertEventsSeenAction}>
                            <input type="hidden" name="alert_id" value={a.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              Marquer vu
                            </Button>
                          </form>
                        ) : null}
                        <form action={deleteAlertAction}>
                          <input type="hidden" name="alert_id" value={a.id} />
                          <Button type="submit" variant="ghost" size="sm" className="text-danger">
                            Supprimer
                          </Button>
                        </form>
                      </div>
                    ) : null
                  }
                />
                <CardContent className="p-0">
                  {a.events.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-muted">Aucune opportunité détectée pour l'instant.</p>
                  ) : (
                    <ul className="divide-y divide-border text-sm">
                      {a.events.map((e) => (
                        <li key={e.id} className={`flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 ${e.seen_at ? "" : "bg-success-soft/40"}`}>
                          <div className="min-w-0">
                            <div className="font-medium">
                              {e.seen_at ? "" : "🚨 NOUVELLE OPPORTUNITÉ · "}
                              {EVENT_KIND_LABEL[e.kind] ?? e.kind}
                            </div>
                            <div className="text-xs text-muted">
                              {e.message} ·{" "}
                              <Link href={`/sourcing/offers/${e.offer_id}` as never} className="underline">
                                {e.offer?.title_original ?? "voir l'offre"}
                              </Link>
                            </div>
                          </div>
                          <span className="text-xs text-muted">{formatDateTime(e.triggered_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
