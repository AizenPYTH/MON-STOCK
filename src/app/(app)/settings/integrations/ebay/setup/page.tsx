import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Check, Circle, CircleDot } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader, Callout, EmptyState, Stat } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { formatDateTime, formatRelative } from "@/lib/format";
import { getSetupState } from "@/features/integrations/queries";
import { formatRunSummary } from "@/features/integrations/format";
import { SyncNowForm } from "@/features/integrations/components/sync-now-form";
import { ConnectEbayButton } from "@/features/integrations/components/connect-ebay-button";

export const metadata: Metadata = { title: "Configuration de votre catalogue" };

type StepStatus = "done" | "current" | "todo";

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") return <Check className="h-4 w-4 text-success" />;
  if (status === "current") return <CircleDot className="h-4 w-4 text-accent" />;
  return <Circle className="h-4 w-4 text-muted" />;
}

function Step({ index, title, status, children }: { index: number; title: string; status: StepStatus; children: ReactNode }) {
  return (
    <li className="relative pl-9">
      <span className={`absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full border ${status === "done" ? "border-green-200 bg-success-soft" : status === "current" ? "border-indigo-200 bg-accent-soft" : "border-border bg-surface"}`}>
        <StepIcon status={status} />
      </span>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">Étape {index}</div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2 space-y-3 text-sm">{children}</div>
    </li>
  );
}

export default async function EbaySetupPage({ searchParams }: { searchParams: Promise<{ connection?: string }> }) {
  const ctx = await requireOrgContext();
  const { connection: connectionId } = await searchParams;
  const writer = canWrite(ctx.role);
  const state = connectionId && /^[0-9a-f-]{36}$/i.test(connectionId) ? await getSetupState(ctx, connectionId) : null;

  if (!state) {
    return (
      <>
        <PageHeader title="Configuration de votre catalogue" />
        <EmptyState title="Connexion eBay introuvable" description="Cette connexion n'existe pas ou n'appartient pas à votre organisation." action={<ButtonLink href="/settings/integrations" variant="secondary">Retour aux intégrations</ButtonLink>} />
      </>
    );
  }

  const c = state.connection;
  const connectionOk = c.status === "connected" || c.status === "error";
  const analysed = state.listingsTotal > 0 || Boolean(state.initialRun && state.initialRun.status !== "failed");
  const validated = analysed && state.unmapped + state.suggested === 0;
  const ordersImported = c.last_orders_cursor !== null;

  const s1: StepStatus = analysed ? "done" : "current";
  const s2: StepStatus = analysed ? "done" : "todo";
  const s3: StepStatus = analysed ? "done" : "todo";
  const s4: StepStatus = validated ? "done" : analysed ? "current" : "todo";
  const s5: StepStatus = ordersImported ? "done" : analysed ? "current" : "todo";

  return (
    <>
      <PageHeader
        title="Configuration de votre catalogue"
        description={`Compte eBay ${c.external_username ?? ""} (${c.environment}). Chaque étape reflète l'état réel de vos données : rien n'est simulé et aucune donnée existante n'est supprimée.`}
        actions={<ButtonLink href="/settings/integrations" variant="secondary">Intégrations</ButtonLink>}
      />
      {!connectionOk ? (
        <Callout tone="danger" title="Connexion inactive" className="mb-5" action={<ConnectEbayButton label="Reconnecter eBay" variant="secondary" />}>
          {c.last_error ?? "Cette connexion n'est plus valide."}
        </Callout>
      ) : null}
      {!writer ? <Callout tone="neutral" className="mb-5">Votre rôle (lecture seule) permet de consulter l'avancement mais pas de lancer les actions.</Callout> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent>
            <ol className="space-y-8">
              <Step index={1} title="Analyse des annonces" status={s1}>
                {analysed ? (
                  <p>
                    <strong className="tnum">{state.listingsActive}</strong> annonce(s) active(s) importée(s) ({state.listingsTotal} au total, variations comprises).
                    {state.initialRun ? ` Dernière analyse ${formatRelative(state.initialRun.started_at)} : ${formatRunSummary(state.initialRun)}.` : ""}
                  </p>
                ) : (
                  <p className="text-muted">Lecture de vos annonces actives via GetMyeBaySelling (Trading API). Aucune commande n'est importée à cette étape.</p>
                )}
                {writer && connectionOk ? <SyncNowForm connectionId={c.id} scope="listings" trigger="initial" label={analysed ? "Relancer l'analyse" : "Analyser mes annonces eBay"} pendingText="Analyse en cours…" variant={analysed ? "secondary" : "primary"} /> : null}
              </Step>

              <Step index={2} title="Détection des SKU" status={s2}>
                {analysed ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Stat label="Avec SKU eBay" value={state.listingsWithSku} hint="Le champ « SKU personnalisé » est renseigné sur eBay." />
                    <Stat label="Sans SKU eBay" value={state.listingsWithoutSku} hint="Association par suggestion ou manuelle." tone={state.listingsWithoutSku > 0 ? "warning" : "neutral"} />
                  </div>
                ) : (
                  <p className="text-muted">Après l'analyse, nous comptons les annonces portant un SKU eBay (champ « SKU personnalisé ») et celles qui n'en ont pas.</p>
                )}
              </Step>

              <Step index={3} title="Correspondances" status={s3}>
                {analysed ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Stat label="Associées automatiquement" value={state.autoMapped} hint="SKU eBay strictement identique à un code SKU interne." tone="success" />
                    <Stat label="Suggestions à valider" value={state.suggested} hint={`${state.pendingSuggestions} suggestion(s) en attente.`} tone={state.suggested > 0 ? "warning" : "neutral"} />
                    <Stat label="Sans correspondance" value={state.unmapped} hint="Association manuelle ou création de SKU." tone={state.unmapped > 0 ? "warning" : "neutral"} />
                  </div>
                ) : (
                  <p className="text-muted">Seule une égalité exacte de SKU (insensible à la casse) est appliquée automatiquement. Les autres annonces reçoivent des suggestions (titre, attributs, EAN) à valider.</p>
                )}
              </Step>

              <Step index={4} title="Validation" status={s4}>
                {validated ? (
                  <p>
                    Toutes les annonces actives sont associées ({state.mappedTotal}) ou ignorées ({state.ignored}).
                  </p>
                ) : analysed ? (
                  <p>
                    <strong className="tnum">{state.unmapped + state.suggested}</strong> annonce(s) restent à traiter : accepter une suggestion, associer manuellement, créer un SKU ou ignorer.
                  </p>
                ) : (
                  <p className="text-muted">Vous validerez ici les suggestions et associerez les annonces restantes.</p>
                )}
                <ButtonLink href="/settings/integrations/mapping" variant={s4 === "current" ? "primary" : "secondary"} size="sm">
                  Ouvrir les associations
                </ButtonLink>
              </Step>

              <Step index={5} title="Synchronisation" status={s5}>
                {ordersImported ? (
                  <p>
                    <strong className="tnum">{state.ordersCount}</strong> commande(s) eBay importée(s), récupérées jusqu'au {formatDateTime(c.last_orders_cursor)}.
                    {c.auto_sync ? ` La synchronisation automatique est active (toutes les ${c.sync_interval_minutes} min).` : " La synchronisation automatique est désactivée."}
                  </p>
                ) : (
                  <p className="text-muted">Import des commandes des 90 derniers jours (Sell Fulfillment API). Les ventes des annonces associées décrémentent le stock ; les autres restent visibles comme « non associées ». Vous pouvez lancer cette étape avant d'avoir tout validé.</p>
                )}
                {writer && connectionOk ? <SyncNowForm connectionId={c.id} scope="full" trigger={ordersImported ? "manual" : "initial"} label={ordersImported ? "Synchroniser maintenant" : "Importer les commandes"} pendingText="Import en cours…" variant={ordersImported ? "secondary" : "primary"} /> : null}
                {state.lastRun ? <p className="text-xs text-muted">Dernier run : {formatRunSummary(state.lastRun)}</p> : null}
              </Step>
            </ol>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-2 text-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-muted">Ce que fait l'assistant</div>
              <ul className="list-disc space-y-1 pl-5 text-muted">
                <li>Lit vos annonces et commandes via les API officielles eBay.</li>
                <li>N'applique automatiquement que les correspondances de SKU exactes.</li>
                <li>Ne supprime jamais vos produits, SKU ou mouvements existants.</li>
                <li>N'envoie aucune quantité vers eBay sans action explicite (ou option activée).</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 text-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-muted">Raccourcis</div>
              <ButtonLink href="/settings/sync" variant="secondary" size="sm">
                Historique des synchronisations
              </ButtonLink>
              <ButtonLink href="/stock" variant="secondary" size="sm">
                Voir le stock
              </ButtonLink>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
