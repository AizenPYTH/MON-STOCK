import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireOrgContext, canWrite, isAdmin } from "@/features/auth/dal";
import { PageHeader, Callout, Section, Stat } from "@/components/ui/page";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { ProAccountDTO } from "@/features/mobile-api/contract";
import { proAccountsHub, supplierOffers } from "@/services/sourcing/pro-accounts";
import { PRO_METHOD_LABEL, PRO_STATUS_LABEL } from "@/domain/sourcing/pro-accounts";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { countryLabel, shortName } from "@/features/directory/labels";
import { SupplierBadge } from "@/features/directory/components/supplier-badge";
import { AccessEmail } from "@/features/directory/components/access-email";
import { ConnectAccountForm, DisconnectAccountForm, SyncAccountForm } from "@/features/pro-accounts/components/account-forms";
import { SupplierOffersTable } from "@/features/pro-accounts/components/offers-table";

export const metadata: Metadata = { title: "Comptes fournisseurs" };

const STATUS_VARIANT: Record<ProAccountDTO["status"], BadgeVariant> = { connected: "success", pending: "warning", error: "danger", not_connected: "neutral" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function importHref(a: ProAccountDTO): string {
  const sp = new URLSearchParams({ supplierName: a.name });
  if (a.supplierId) sp.set("supplierId", a.supplierId);
  return `/sourcing/imports/new?${sp.toString()}`;
}

function AccountCard({ account: a, writer, admin }: { account: ProAccountDTO; writer: boolean; admin: boolean }) {
  return (
    <Card id={`compte-${a.key}`} className="scroll-mt-20">
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-start gap-3">
          <SupplierBadge name={a.name} domain={a.domain} />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">
              <Link href={`/suppliers/directory/${encodeURIComponent(a.key)}` as never} className="hover:underline">
                {a.name}
              </Link>
            </h3>
            <p className="text-xs text-muted">{[countryLabel(a.country), a.domain].filter(Boolean).join(" · ")}</p>
          </div>
          <Badge variant={STATUS_VARIANT[a.status]}>{PRO_STATUS_LABEL[a.status]}</Badge>
        </div>
        <p className="text-sm">{a.benefit}</p>
        <p className="text-xs text-muted-strong">{a.requirements}</p>
        {a.caution ? <p className="text-xs text-amber-700">{a.caution}</p> : null}
        {a.status !== "not_connected" ? (
          <p className="text-xs tnum">
            {formatNumber(a.offers)} offre{a.offers > 1 ? "s" : ""} de votre compte
            {a.lastSyncAt ? ` · mise à jour ${formatDateTime(a.lastSyncAt)} (${formatRelative(a.lastSyncAt)})` : " · aucune mise à jour réussie"}
            {a.lastError ? <span className="block text-danger">{a.lastError}</span> : null}
          </p>
        ) : null}

        <div className="flex flex-wrap items-start gap-2">
          {writer && a.connectionId ? <SyncAccountForm connectionId={a.connectionId} /> : null}
          {writer && a.methods.includes("file") ? (
            <ButtonLink href={importHref(a)} variant={a.connector ? "secondary" : "primary"} size="sm">
              {PRO_METHOD_LABEL.file}
            </ButtonLink>
          ) : null}
          {writer && a.methods.includes("feed") ? (
            <ButtonLink href="/sourcing/sources/new-feed" variant="secondary" size="sm">
              {PRO_METHOD_LABEL.feed}
            </ButtonLink>
          ) : null}
          <ButtonLink href={a.signupUrl} variant="ghost" size="sm">
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            {a.status === "not_connected" ? "Créer mon compte" : "Ouvrir le site"}
          </ButtonLink>
          {a.supplierId && a.offers > 0 ? (
            <ButtonLink href={`/suppliers/accounts?produits=${a.supplierId}#produits`} variant="ghost" size="sm">
              Voir les produits récupérés
            </ButtonLink>
          ) : null}
        </div>

        {writer && a.connector && !a.connectionId ? (
          <details className="rounded-lg border border-border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">{PRO_METHOD_LABEL.api}</summary>
            <div className="pt-3">
              <ConnectAccountForm accountKey={a.key} accountName={a.name} fields={a.connector.fields} />
            </div>
          </details>
        ) : null}
        {a.status === "not_connected" ? (
          <details className="rounded-lg border border-border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">Demander l&apos;accès (e-mail prêt)</summary>
            <div className="pt-3">
              <AccessEmail email={a.email.fr} lang="fr" idPrefix={`acc-${a.key}`} />
            </div>
          </details>
        ) : null}
        {admin && a.connectionId ? (
          <div className="border-t border-border pt-3">
            <DisconnectAccountForm connectionId={a.connectionId} accountName={shortName(a.name)} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function ProAccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  const produitsRaw = Array.isArray(sp.produits) ? sp.produits[0] : sp.produits;
  const hub = await proAccountsHub(ctx);
  const writer = canWrite(ctx.role);
  const admin = isAdmin(ctx.role);
  const selected = produitsRaw && UUID.test(produitsRaw) ? (hub.accounts.find((a) => a.supplierId === produitsRaw) ?? null) : null;
  const offers = selected?.supplierId ? await supplierOffers(ctx, selected.supplierId, 50) : null;
  const connected = hub.accounts.filter((a) => a.status === "connected").length;
  const { totals } = hub;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={"/suppliers" as never} className="hover:underline">
            Fournisseurs
          </Link>
        }
        title="Comptes fournisseurs"
        description="Les meilleurs prix d'achat sont derrière vos comptes revendeur (prix HT, par grade). Branchez-les en premier (API, flux ou liste de stock) ; MON STOCK complète avec les sources publiques, chaque offre gardant le lien vers la page du produit."
        actions={
          <>
            <ButtonLink href="/suppliers/directory" variant="secondary">
              Annuaire
            </ButtonLink>
            <ButtonLink href="/sourcing/sources" variant="secondary">
              Mes sources
            </ButtonLink>
          </>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Comptes connectés" value={formatNumber(connected)} hint={`sur ${formatNumber(hub.accounts.length)} comptes prioritaires`} tone={connected > 0 ? "success" : undefined} />
        <Stat label="Offres de vos comptes" value={formatNumber(totals.account)} />
        <Stat label="Offres publiques" value={formatNumber(totals.public)} />
        <Stat label="Annonces de places de marché" value={formatNumber(totals.marketplace)} />
      </div>

      {selected && offers ? (
        <Section title={`Produits récupérés — ${shortName(selected.name)} (${formatNumber(offers.total)})`} description="Offres actives les plus récemment vues ; prix datés." actions={<ButtonLink href="/suppliers/accounts" variant="ghost" size="sm">Fermer</ButtonLink>} className="mb-8 scroll-mt-20">
          <div id="produits" />
          {offers.offers.length ? (
            <>
              <SupplierOffersTable offers={offers.offers} orgCurrency={ctx.organization.default_currency} caption={`Produits récupérés pour ${selected.name}`} />
              {offers.total > offers.offers.length ? <p className="text-xs text-muted">… et {formatNumber(offers.total - offers.offers.length)} autres : utilisez la recherche Sourcing pour les comparer.</p> : null}
            </>
          ) : (
            <Callout tone="neutral">Aucun produit actif pour ce compte.</Callout>
          )}
        </Section>
      ) : null}

      <Section title="Comptes professionnels" description="Ouverture d'un compte : Kbis et n° de TVA en général. Rien n'est présenté comme connecté avant un test réel par le serveur.">
        <div className="grid gap-4 lg:grid-cols-2">
          {hub.accounts.map((a) => (
            <AccountCard key={a.key} account={a} writer={writer} admin={admin} />
          ))}
        </div>
      </Section>

      <Section title={`Sources publiques déjà incluses (${hub.publicSources.length})`} description="Catalogues consultables publiquement, relevés automatiquement ; chaque offre garde le lien vers la page du produit." className="mt-8">
        {hub.publicSources.length === 0 ? (
          <Callout tone="neutral" action={writer ? <ButtonLink href="/sourcing/sources#bibliotheque" variant="secondary" size="sm">Bibliothèque de sources</ButtonLink> : undefined}>
            Aucune source publique active pour l&apos;instant.
          </Callout>
        ) : (
          <Table>
            <caption className="sr-only">Sources publiques actives</caption>
            <THead>
              <tr>
                <TH scope="col">Fournisseur</TH>
                <TH scope="col">Domaine</TH>
                <TH scope="col" align="right">
                  Offres actives
                </TH>
                <TH scope="col">Dernier succès</TH>
              </tr>
            </THead>
            <TBody>
              {hub.publicSources.map((s) => (
                <TR key={s.sourceId}>
                  <TD>
                    <span className="flex items-center gap-2.5">
                      <SupplierBadge name={s.supplierName} size="sm" />
                      <span className="font-medium">{s.supplierName}</span>
                    </span>
                  </TD>
                  <TD className="text-xs text-muted">{s.domain ?? "—"}</TD>
                  <TD align="right">{formatNumber(s.offers)}</TD>
                  <TD className="text-xs">{s.lastSuccessAt ? formatRelative(s.lastSuccessAt) : "jamais"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      <p className="mt-6 text-xs text-muted">Logos et noms affichés uniquement pour identifier les fournisseurs : ils restent la propriété de leurs titulaires et n&apos;indiquent aucun partenariat. Informations issues de l&apos;étude du 15/10/2026, à confirmer avec chaque fournisseur.</p>
    </>
  );
}
