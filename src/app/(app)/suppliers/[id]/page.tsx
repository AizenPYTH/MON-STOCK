import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DescriptionList, Stat } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { getSupplier, getSupplierTabCounts } from "@/features/suppliers/queries";
import { SupplierHeader } from "@/features/suppliers/components/supplier-header";
import { SupplierForm } from "@/features/suppliers/components/supplier-form";
import { archiveSupplierAction } from "@/features/suppliers/actions";
import { formatDate, formatMoney, NOT_PROVIDED } from "@/lib/format";

export const metadata: Metadata = { title: "Fournisseur" };

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const { id } = await params;
  const sp = await searchParams;
  const orderSku = typeof sp.order_sku === "string" ? sp.order_sku : null;
  if (orderSku) {
    const q = new URLSearchParams({ order_sku: orderSku });
    if (typeof sp.qty === "string") q.set("qty", sp.qty);
    if (typeof sp.offer === "string") q.set("offer", sp.offer);
    redirect(`/suppliers/${id}/orders?${q.toString()}`);
  }
  const supplier = await getSupplier(ctx, id);
  if (!supplier) notFound();
  const counts = await getSupplierTabCounts(ctx, supplier.id);
  const writable = canWrite(ctx.role);
  return (
    <>
      <SupplierHeader supplier={supplier} tab="info" counts={counts} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Offres actives" value={counts.offers} />
        <Stat label="Sources & flux" value={counts.sources} hint={counts.sources === 0 ? "Source non connectée" : undefined} />
        <Stat label="Commandes" value={counts.orders} />
        <Stat label="Délai annoncé" value={supplier.average_lead_time_days === null ? NOT_PROVIDED : `${supplier.average_lead_time_days} j`} hint="Le délai réel est mesuré sur vos réceptions (onglet Performance)." />
      </div>
      {writable ? (
        <div className="max-w-4xl space-y-6">
          <SupplierForm supplier={supplier} defaultCurrency={ctx.organization.default_currency} />
          <Card>
            <CardHeader title={supplier.is_archived ? "Restaurer" : "Archiver"} description="Un fournisseur archivé disparaît des listes mais ses offres et commandes sont conservées." />
            <CardContent>
              <form action={archiveSupplierAction}>
                <input type="hidden" name="supplier_id" value={supplier.id} />
                <input type="hidden" name="archive" value={supplier.is_archived ? "false" : "true"} />
                <Button type="submit" variant={supplier.is_archived ? "secondary" : "danger"}>
                  {supplier.is_archived ? "Restaurer ce fournisseur" : "Archiver ce fournisseur"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader title="Informations" />
          <CardContent>
            <DescriptionList
              items={[
                { label: "Société", value: supplier.company ?? NOT_PROVIDED },
                { label: "Pays", value: supplier.country ?? NOT_PROVIDED },
                { label: "Site web", value: supplier.website ?? NOT_PROVIDED },
                { label: "Email", value: supplier.email ?? NOT_PROVIDED },
                { label: "Téléphone", value: supplier.phone ?? NOT_PROVIDED },
                { label: "Contact", value: supplier.contact_name ?? NOT_PROVIDED },
                { label: "Devise", value: supplier.currency },
                { label: "MOQ par défaut", value: supplier.default_moq ?? NOT_PROVIDED },
                { label: "Minimum de commande", value: supplier.minimum_order_value === null ? NOT_PROVIDED : formatMoney(supplier.minimum_order_value, supplier.currency) },
                { label: "Conditions de paiement", value: supplier.payment_terms ?? NOT_PROVIDED },
                { label: "Créé le", value: formatDate(supplier.created_at) },
              ]}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
