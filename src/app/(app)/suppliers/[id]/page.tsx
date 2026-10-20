import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DescriptionList } from "@/components/ui/page";
import { getSupplier, getSupplierTabCounts } from "@/features/suppliers/queries";
import { SupplierHeader } from "@/features/suppliers/components/supplier-header";
import { SupplierForm } from "@/features/suppliers/components/supplier-form";
import { archiveSupplierAction } from "@/features/suppliers/actions";
import { ActionButtonForm } from "@/features/sourcing/components/action-button-form";
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
    <SupplierHeader supplier={supplier} tab="info" counts={counts}>
      {Number.isFinite(Number(supplier.average_lead_time_days ?? NaN)) ? <p className="mb-4 text-[13px] font-semibold text-muted">Délai annoncé : {supplier.average_lead_time_days} j · le délai réel est mesuré sur vos réceptions (onglet Performance).</p> : null}
      {writable ? (
        <div className="max-w-4xl space-y-6">
          <SupplierForm supplier={supplier} defaultCurrency={ctx.organization.default_currency} />
          <Card>
            <CardHeader title={supplier.is_archived ? "Restaurer" : "Archiver"} description="Un fournisseur archivé disparaît des listes mais ses offres et commandes sont conservées." />
            <CardContent>
              <ActionButtonForm action={archiveSupplierAction} fields={{ supplier_id: supplier.id, archive: supplier.is_archived ? "false" : "true" }} variant={supplier.is_archived ? "secondary" : "danger"} size="md">
                {supplier.is_archived ? "Restaurer ce fournisseur" : "Archiver ce fournisseur"}
              </ActionButtonForm>
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
    </SupplierHeader>
  );
}
