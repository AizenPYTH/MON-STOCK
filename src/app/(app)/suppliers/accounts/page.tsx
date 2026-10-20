import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireOrgContext, canWrite, isAdmin } from "@/features/auth/dal";
import { Callout } from "@/components/ui/page";
import {
  LevelDot,
  MonoTitle,
  Panel,
  Paper,
  Scene,
  SceneHeader,
  StageStats,
} from "@/components/instrument";
import { ButtonLink } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { ProAccountDTO } from "@/features/mobile-api/contract";
import {
  proAccountsHub,
  supplierOffers,
} from "@/services/sourcing/pro-accounts";
import {
  PRO_METHOD_LABEL,
  PRO_STATUS_LABEL,
} from "@/domain/sourcing/pro-accounts";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { countryLabel, shortName } from "@/features/directory/labels";
import { SupplierBadge } from "@/features/directory/components/supplier-badge";
import { AccessEmail } from "@/features/directory/components/access-email";
import {
  ConnectAccountForm,
  DisconnectAccountForm,
  SyncAccountForm,
} from "@/features/pro-accounts/components/account-forms";
import { SupplierOffersTable } from "@/features/pro-accounts/components/offers-table";

export const metadata: Metadata = { title: "Comptes fournisseurs" };

const STATUS_TONE = {
  connected: "ok",
  pending: "low",
  error: "out",
  not_connected: "neutral",
} as const;
const STATUS_TEXT = {
  connected: "text-success",
  pending: "text-warning",
  error: "text-danger",
  not_connected: "text-foreground",
} as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function importHref(a: ProAccountDTO): string {
  const sp = new URLSearchParams({ supplierName: a.name });
  if (a.supplierId) sp.set("supplierId", a.supplierId);
  return `/sourcing/imports/new?${sp.toString()}`;
}

function AccountCard({
  account: a,
  writer,
  admin,
}: {
  account: ProAccountDTO;
  writer: boolean;
  admin: boolean;
}) {
  return (
    <Panel as="article" className="flex scroll-mt-20 flex-col gap-3 p-4">
      <span id={`compte-${a.key}`} className="sr-only" />
      <div className="flex flex-wrap items-center gap-3">
        <SupplierBadge name={a.name} domain={a.domain} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold leading-[22px]">
            <Link
              href={
                `/suppliers/directory/${encodeURIComponent(a.key)}` as never
              }
              className="hover:underline"
            >
              {a.name}
            </Link>
          </h3>
          <p className="text-[13px] font-semibold text-ink-3">
            {[countryLabel(a.country), a.domain].filter(Boolean).join(" · ")}
          </p>
        </div>
        <LevelDot
          tone={STATUS_TONE[a.status]}
          className={`font-bold ${STATUS_TEXT[a.status]}`}
        >
          {PRO_STATUS_LABEL[a.status]}
        </LevelDot>
      </div>
      <p className="text-sm font-semibold">{a.benefit}</p>
      <p className="text-[12.5px] font-semibold text-muted">{a.requirements}</p>
      {a.caution ? (
        <p className="text-[12.5px] font-semibold text-warning">{a.caution}</p>
      ) : null}
      {a.status !== "not_connected" ? (
        <p className="text-[12.5px] font-semibold tnum">
          {formatNumber(a.offers)} offre{a.offers > 1 ? "s" : ""} de votre
          compte
          {a.lastSyncAt
            ? ` · mise à jour ${formatDateTime(a.lastSyncAt)} (${formatRelative(a.lastSyncAt)})`
            : " · aucune mise à jour réussie"}
          {a.lastError ? (
            <span className="block text-danger">{a.lastError}</span>
          ) : null}
        </p>
      ) : null}

      <div className="flex flex-wrap items-start gap-2">
        {writer && a.connectionId ? (
          <SyncAccountForm connectionId={a.connectionId} />
        ) : null}
        {writer && a.methods.includes("file") ? (
          <ButtonLink
            href={importHref(a)}
            variant={a.connector ? "secondary" : "primary"}
            size="sm"
          >
            {PRO_METHOD_LABEL.file}
          </ButtonLink>
        ) : null}
        {writer && a.methods.includes("feed") ? (
          <ButtonLink
            href="/sourcing/sources/new-feed"
            variant="secondary"
            size="sm"
          >
            {PRO_METHOD_LABEL.feed}
          </ButtonLink>
        ) : null}
        <ButtonLink href={a.signupUrl} variant="ghost" size="sm">
          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          {a.status === "not_connected" ? "Créer mon compte" : "Ouvrir le site"}
        </ButtonLink>
        {a.supplierId && a.offers > 0 ? (
          <ButtonLink
            href={`/suppliers/accounts?produits=${a.supplierId}#produits`}
            variant="ghost"
            size="sm"
          >
            Voir les produits récupérés
          </ButtonLink>
        ) : null}
      </div>

      {writer && a.connector && !a.connectionId ? (
        <details className="rounded-xl border border-border px-3 py-1">
          <summary className="min-h-10 cursor-pointer py-2 text-sm font-bold">
            {PRO_METHOD_LABEL.api}
          </summary>
          <div className="pt-3">
            <ConnectAccountForm
              accountKey={a.key}
              accountName={a.name}
              fields={a.connector.fields}
            />
          </div>
        </details>
      ) : null}
      {a.status === "not_connected" ? (
        <details className="rounded-xl border border-border px-3 py-1">
          <summary className="min-h-10 cursor-pointer py-2 text-sm font-bold">
            Demander l&apos;accès (e-mail prêt)
          </summary>
          <div className="pt-3">
            <AccessEmail
              email={a.email.fr}
              lang="fr"
              idPrefix={`acc-${a.key}`}
            />
          </div>
        </details>
      ) : null}
      {admin && a.connectionId ? (
        <div className="border-t border-line-soft pt-3">
          <DisconnectAccountForm
            connectionId={a.connectionId}
            accountName={shortName(a.name)}
          />
        </div>
      ) : null}
    </Panel>
  );
}

export default async function ProAccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  const produitsRaw = Array.isArray(sp.produits) ? sp.produits[0] : sp.produits;
  const hub = await proAccountsHub(ctx);
  const writer = canWrite(ctx.role);
  const admin = isAdmin(ctx.role);
  const selected =
    produitsRaw && UUID.test(produitsRaw)
      ? (hub.accounts.find((a) => a.supplierId === produitsRaw) ?? null)
      : null;
  const offers = selected?.supplierId
    ? await supplierOffers(ctx, selected.supplierId, 50)
    : null;
  const connected = hub.accounts.filter((a) => a.status === "connected").length;
  const { totals } = hub;

  return (
    <>
      <Scene>
        <SceneHeader
          eyebrow="Fournisseurs · mes comptes pro"
          title="Comptes fournisseurs"
          description="Les meilleurs prix d'achat sont derrière vos comptes revendeur (prix HT, par grade). Branchez-les en premier (API, flux ou liste de stock) ; MON STOCK complète avec les sources publiques."
          actions={
            <>
              <ButtonLink href="/suppliers/directory" variant="night">
                Annuaire
              </ButtonLink>
              <ButtonLink href="/sourcing/sources" variant="night">
                Sources &amp; flux
              </ButtonLink>
            </>
          }
        />
        <StageStats
          className="mt-6 max-w-[820px]"
          stats={[
            {
              label: "Comptes connectés",
              value: `${formatNumber(connected)} / ${formatNumber(hub.accounts.length)}`,
              tone: connected > 0 ? "mint" : undefined,
            },
            {
              label: "Offres de vos comptes",
              value: formatNumber(totals.account),
            },
            { label: "Offres publiques", value: formatNumber(totals.public) },
            {
              label: "Places de marché",
              value: formatNumber(totals.marketplace),
            },
          ]}
        />
      </Scene>
      <Paper>
        {selected && offers ? (
          <section
            id="produits"
            className="mb-8 flex scroll-mt-20 flex-col gap-2.5"
          >
            <MonoTitle
              title={`Produits récupérés · ${shortName(selected.name)}`}
              count={formatNumber(offers.total)}
              right={
                <ButtonLink href="/suppliers/accounts" variant="ghost">
                  Fermer
                </ButtonLink>
              }
            />
            {offers.offers.length ? (
              <>
                <SupplierOffersTable
                  offers={offers.offers}
                  orgCurrency={ctx.organization.default_currency}
                  caption={`Produits récupérés pour ${selected.name}`}
                />
                {offers.total > offers.offers.length ? (
                  <p className="text-xs text-muted">
                    … et {formatNumber(offers.total - offers.offers.length)}{" "}
                    autres : utilisez la recherche Sourcing pour les comparer.
                  </p>
                ) : null}
              </>
            ) : (
              <Callout tone="neutral">
                Aucun produit actif pour ce compte.
              </Callout>
            )}
          </section>
        ) : null}

        <section className="flex flex-col gap-2.5">
          <MonoTitle
            title="Comptes professionnels"
            count={hub.accounts.length}
            aside="Kbis et n° de TVA en général"
          />
          <p className="text-[13px] font-semibold text-muted">
            Rien n&apos;est présenté comme connecté avant un test réel par le
            serveur.
          </p>
          <div className="grid gap-2.5 lg:grid-cols-2">
            {hub.accounts.map((a) => (
              <AccountCard
                key={a.key}
                account={a}
                writer={writer}
                admin={admin}
              />
            ))}
          </div>
        </section>

        <section className="mt-8 flex flex-col gap-2.5">
          <MonoTitle
            title="Sources publiques déjà incluses"
            count={hub.publicSources.length}
          />
          <p className="text-[13px] font-semibold text-muted">
            Catalogues consultables publiquement, relevés automatiquement ;
            chaque offre garde le lien vers la page du produit.
          </p>
          {hub.publicSources.length === 0 ? (
            <Callout
              tone="neutral"
              action={
                writer ? (
                  <ButtonLink
                    href="/sourcing/sources#bibliotheque"
                    variant="secondary"
                    size="sm"
                  >
                    Bibliothèque de sources
                  </ButtonLink>
                ) : undefined
              }
            >
              Aucune source publique active pour l&apos;instant.
            </Callout>
          ) : (
            <Panel className="overflow-hidden">
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
                      <TD className="text-xs">
                        {s.lastSuccessAt
                          ? formatRelative(s.lastSuccessAt)
                          : "jamais"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Panel>
          )}
        </section>

        <p className="mt-6 text-xs font-semibold text-ink-3">
          Logos et noms affichés uniquement pour identifier les fournisseurs :
          ils restent la propriété de leurs titulaires et n&apos;indiquent aucun
          partenariat. Informations issues de l&apos;étude du 15/10/2026, à
          confirmer avec chaque fournisseur.
        </p>
      </Paper>
    </>
  );
}
