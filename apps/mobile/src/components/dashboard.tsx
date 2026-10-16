import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { AlertTriangle, BellRing, Boxes, CheckCircle2, FileWarning, Library, Link2Off, Mic, PackageMinus, PackagePlus, PackageX, Plug, Plus, ScanSearch, Search, Sparkles, Truck, Upload, WalletCards } from "lucide-react-native";
import type { ImportJobDTO, ProAccountsHubDTO, RadarDTO } from "@/features/mobile-api/contract";
import type { Catalog, StockSummary } from "~/data/catalog";
import type { OpenAlert, TodayData } from "~/data/intelligence";
import { STATUS_LABEL as RADAR_STATUS_LABEL } from "~/data/radar";
import { formatCompactMoney, formatMoneyRounded, formatNumber, formatRelative } from "~/lib/format";
import { ActionRow, Card, FadeIn, MetricStrip, ProgressBar, SectionHeader, ShortcutGrid, ShortcutTile, Txt, type BlockTone } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";

/**
 * Accueil « centre de pilotage » : uniquement des chiffres calculés sur les données réelles de
 * l'organisation (stock, ventes, imports, connexions, radar). Une donnée absente est masquée ou
 * affichée « — », jamais remplacée par une valeur supposée.
 */

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`;

/** Bande de chiffres du stock (valeur au coût connu, références, ruptures, faibles). */
export function StockPulse({ catalog, summary, currency }: { catalog: Catalog | undefined; summary: StockSummary | null; currency: string }) {
  const partial = Boolean(summary && summary.skusWithoutCost > 0);
  return (
    <MetricStrip
      metrics={[
        {
          label: "Valeur",
          value: summary ? `${partial ? "≈ " : ""}${formatCompactMoney(summary.value, currency)}` : null,
          hint: summary ? (partial ? `${summary.skusWithoutCost} sans coût` : "au coût") : undefined,
          onPress: () => router.push("/stock"),
          testID: "pulse-value",
        },
        { label: "Références", value: summary ? formatNumber(summary.skus) : null, hint: catalog ? plural(catalog.counts.all, "produit", "produits") : undefined, onPress: () => router.push("/stock"), testID: "pulse-skus" },
        { label: "Ruptures", value: catalog ? formatNumber(catalog.counts.out) : null, tone: catalog && catalog.counts.out > 0 ? "danger" : undefined, hint: "à 0", onPress: () => router.push({ pathname: "/stock", params: { filter: "out" } }), testID: "pulse-out" },
        { label: "Faibles", value: catalog ? formatNumber(catalog.counts.low) : null, tone: catalog && catalog.counts.low > 0 ? "warning" : undefined, hint: "sous seuil", onPress: () => router.push({ pathname: "/stock", params: { filter: "low" } }), testID: "pulse-low" },
      ]}
    />
  );
}

type Task = { key: string; icon: typeof AlertTriangle; tone: BlockTone; title: string; detail?: string | null; cta: string; go: () => void; rank: number };

/** Tâches actionnables, des plus graves aux moins graves ; chacune mène à sa résolution. */
export function buildTasks(input: { today?: TodayData; catalog?: Catalog; jobs?: ImportJobDTO[]; accounts?: ProAccountsHubDTO; alerts?: OpenAlert[]; now?: Date }): Task[] {
  const { today, catalog, jobs, accounts, alerts } = input;
  const now = input.now ?? new Date();
  const tasks: Task[] = [];
  const recentJobs = (jobs ?? []).filter((j) => now.getTime() - new Date(j.startedAt).getTime() < 14 * 86_400_000);
  // seul le DERNIER import de chaque fournisseur compte (un échec corrigé depuis n'est plus à traiter)
  const latest = new Map<string, ImportJobDTO>();
  for (const j of recentJobs) {
    const k = j.supplierId ?? j.id;
    const cur = latest.get(k);
    if (!cur || cur.startedAt < j.startedAt) latest.set(k, j);
  }
  for (const j of latest.values()) {
    const who = j.supplierName ?? "Import";
    if (j.status === "failed" || j.status === "quarantined")
      tasks.push({ key: `job-${j.id}`, icon: FileWarning, tone: "danger", title: `Import échoué · ${who}`, detail: j.message ?? j.fileName, cta: "Rapport", go: () => router.push({ pathname: "/sourcing-imports/[id]", params: { id: j.id } }), rank: 0 });
    else if (j.status === "partial" && j.counts.invalid + j.counts.unrecognized > 0)
      tasks.push({ key: `job-${j.id}`, icon: FileWarning, tone: "warning", title: `Import partiel · ${who}`, detail: `${plural(j.counts.invalid + j.counts.unrecognized, "ligne ignorée", "lignes ignorées")} sur ${formatNumber(j.counts.read)}`, cta: "Rapport", go: () => router.push({ pathname: "/sourcing-imports/[id]", params: { id: j.id } }), rank: 3 });
  }
  for (const a of accounts?.accounts ?? [])
    if (a.status === "error")
      tasks.push({ key: `acc-${a.key}`, icon: Link2Off, tone: "danger", title: `Connexion ${a.name} en erreur`, detail: a.lastError, cta: "Corriger", go: () => router.push({ pathname: "/supplier-directory/[key]", params: { key: a.key } }), rank: 0 });
  if (catalog && catalog.counts.out > 0) tasks.push({ key: "out", icon: PackageX, tone: "danger", title: plural(catalog.counts.out, "produit en rupture", "produits en rupture"), detail: "Réapprovisionnez ou retirez les annonces", cta: "Voir", go: () => router.push({ pathname: "/stock", params: { filter: "out" } }), rank: 1 });
  if (today && today.toShip > 0) tasks.push({ key: "ship", icon: Truck, tone: "warning", title: plural(today.toShip, "commande à expédier", "commandes à expédier"), detail: "Payées, en attente d'expédition", cta: "Expédier", go: () => router.push({ pathname: "/sales", params: { status: "paid" } }), rank: 2 });
  if (catalog && catalog.counts.low > 0) tasks.push({ key: "low", icon: PackageMinus, tone: "warning", title: plural(catalog.counts.low, "produit en stock faible", "produits en stock faible"), detail: "Sous le seuil de réapprovisionnement", cta: "Voir", go: () => router.push({ pathname: "/stock", params: { filter: "low" } }), rank: 3 });
  if (today && today.pendingSales > 0) tasks.push({ key: "pending", icon: Boxes, tone: "neutral", title: plural(today.pendingSales, "vente non déduite du stock", "ventes non déduites du stock"), detail: "Associez l'annonce à un produit", cta: "Traiter", go: () => router.push("/sales"), rank: 4 });
  // alertes ouvertes liées à un produit, hors ruptures / stock faible (déjà résumés ci-dessus)
  for (const al of (alerts ?? []).filter((x) => x.entityType === "sku" && x.entityId && !/stock|out_of|low/i.test(x.type)).slice(0, 2)) {
    tasks.push({ key: `alert-${al.id}`, icon: BellRing, tone: al.severity === "critical" ? "danger" : "info", title: al.title, detail: al.message, cta: "Ouvrir", go: () => router.push({ pathname: "/sku/[skuId]", params: { skuId: al.entityId! } }), rank: al.severity === "critical" ? 1 : 4 });
  }
  return tasks.sort((a, b) => a.rank - b.rank);
}

export function TaskList({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0)
    return (
      <Card>
        <ActionRow icon={CheckCircle2} tone="success" title="Tout est à jour" detail="Aucune rupture, commande en attente ni import en erreur." last />
      </Card>
    );
  const shown = tasks.slice(0, 6);
  return (
    <Card testID="task-list">
      {shown.map((t, i) => (
        <FadeIn key={t.key} index={i}>
          <ActionRow icon={t.icon} tone={t.tone} title={t.title} detail={t.detail} cta={t.cta} onPress={t.go} last={i === shown.length - 1} testID={`task-${t.key}`} />
        </FadeIn>
      ))}
    </Card>
  );
}

/** Raccourcis vers les opérations fréquentes (toutes réelles). */
export function Shortcuts() {
  return (
    <ShortcutGrid>
      {[
        <ShortcutTile key="search" accent icon={Search} label="Trouver une offre" sub="Prix fournisseurs" onPress={() => router.push("/sourcing")} testID="shortcut-search" />,
        <ShortcutTile key="add" icon={Plus} label="Ajouter un produit" sub="Saisie ou voix" onPress={() => router.push("/product/new")} testID="shortcut-add" />,
        <ShortcutTile key="import" icon={Upload} label="Importer un catalogue" sub="CSV, Excel, XML, JSON" onPress={() => router.push("/sourcing-import")} testID="shortcut-import" />,
        <ShortcutTile key="library" icon={Library} label="Fournisseurs" sub="Bibliothèque B2B" onPress={() => router.push("/supplier-directory")} testID="shortcut-library" />,
      ]}
    </ShortcutGrid>
  );
}

/** Accès au conseiller IA (texte ou voix). */
export function AdvisorEntry() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Parler à votre conseiller"
      onPress={() => router.push("/advisor")}
      testID="assistant-entry"
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space[3], padding: space[3], paddingLeft: space[4], borderRadius: radius.xl, backgroundColor: pressed ? color.nightRaised : color.brand })}
    >
      <Sparkles size={18} color={color.mint} />
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="body" color={color.inkOnDark}>
          Votre conseiller
        </Txt>
        <Txt variant="label" color={color.inkOnDarkMuted} numberOfLines={1}>
          « Que dois-je racheter cette semaine ? »
        </Txt>
      </View>
      <View style={{ width: 40, height: 40, borderRadius: radius.lg, backgroundColor: color.mint, alignItems: "center", justifyContent: "center" }}>
        <Mic size={18} color={color.onMint} />
      </View>
    </Pressable>
  );
}

/** Sourcing : origine des prix connus et meilleures opportunités du radar (estimations signalées). */
export function SourcingPanel({ accounts, radar, currency }: { accounts: ProAccountsHubDTO | undefined; radar: RadarDTO | undefined; currency: string }) {
  const connected = (accounts?.accounts ?? []).filter((a) => a.status === "connected").length;
  const opportunities = (radar?.items ?? []).filter((i) => (i.evaluation.status === "profitable" || i.evaluation.status === "estimated") && (i.evaluation.estimatedProfit ?? 0) > 0).slice(0, 3);
  const restock = (radar?.restock ?? []).filter((r) => r.bestPrice !== null).slice(0, 2);
  const totals = accounts?.totals;
  return (
    <View style={{ gap: space[2] }}>
      <MetricStrip
        metrics={[
          { label: "Vos comptes", value: totals ? formatNumber(totals.account) : null, hint: accounts ? plural(connected, "connecté", "connectés") : undefined, onPress: () => router.push("/pro-accounts"), testID: "sourcing-accounts" },
          { label: "Publiques", value: totals ? formatNumber(totals.public) : null, hint: "offres actives", onPress: () => router.push("/sourcing-connections") },
          { label: "Marché", value: totals ? formatNumber(totals.marketplace) : null, hint: "annonces eBay", onPress: () => router.push("/sourcing") },
        ]}
      />
      {opportunities.length > 0 || restock.length > 0 ? (
        <Card testID="opportunities">
          {opportunities.map((i, k) => {
            const e = i.evaluation;
            const provisional = e.status === "estimated";
            return (
              <ActionRow
                key={i.offer.offerId}
                icon={ScanSearch}
                tone="success"
                title={i.sku.name}
                detail={`${i.offer.supplierName} · achat ${formatMoneyRounded(i.offer.price, i.offer.currency ?? currency)} · ${provisional ? "marge provisoire" : RADAR_STATUS_LABEL[e.status].toLowerCase()}`}
                valueHint="marge"
                value={e.estimatedProfit === null ? undefined : `${provisional ? "≈ " : ""}+${formatMoneyRounded(e.estimatedProfit, currency)}`}
                onPress={() => router.push({ pathname: "/radar/[offerId]", params: { offerId: i.offer.offerId } })}
                last={k === opportunities.length - 1 && restock.length === 0}
              />
            );
          })}
          {restock.map((r, k) => (
            <ActionRow
              key={r.skuId}
              icon={PackagePlus}
              tone="info"
              title={`Racheter · ${r.name}`}
              detail={`${r.quantityAvailable > 0 ? `${formatNumber(r.quantityAvailable)} en stock${r.daysOfCover !== null ? ` · ${formatNumber(r.daysOfCover)} j` : ""}` : "En rupture"}${r.bestSupplier ? ` · meilleur prix ${r.bestSupplier}` : ""}`}
              value={formatMoneyRounded(r.bestPrice, currency)}
              onPress={() => (r.bestOfferId ? router.push({ pathname: "/radar/[offerId]", params: { offerId: r.bestOfferId } }) : router.push({ pathname: "/sourcing", params: { q: r.name } }))}
              last={k === restock.length - 1}
            />
          ))}
        </Card>
      ) : (
        <Card>
          <ActionRow icon={Plug} tone="neutral" title="Aucune opportunité calculable" detail="Reliez des offres fournisseurs à vos produits pour estimer vos marges d'achat." cta="Radar" onPress={() => router.push("/radar")} last />
        </Card>
      )}
      {radar && radar.missingSettings.length > 0 && opportunities.length > 0 ? (
        <Txt variant="label" style={{ fontSize: 12, lineHeight: 16 }}>
          Marges provisoires : {radar.missingSettings.slice(0, 3).join(", ")}
          {radar.missingSettings.length > 3 ? "…" : ""} non renseignés.{" "}
          <Txt variant="label" color={color.ink} style={{ fontSize: 12, lineHeight: 16, fontFamily: "Manrope_700Bold", textDecorationLine: "underline" }} onPress={() => router.push("/radar/settings")} accessibilityRole="link">
            Compléter
          </Txt>
        </Txt>
      ) : null}
    </View>
  );
}

/** Dernier import (activité utile) avec son résultat réel. */
export function LastImportRow({ job, last }: { job: ImportJobDTO; last?: boolean }) {
  const ok = job.status === "completed";
  return (
    <ActionRow
      icon={ok ? CheckCircle2 : job.status === "failed" ? AlertTriangle : FileWarning}
      tone={ok ? "success" : job.status === "failed" ? "danger" : "warning"}
      title={`Import ${job.supplierName ?? ""}`.trim()}
      detail={`${formatRelative(job.startedAt)} · ${formatNumber(job.counts.created + job.counts.updated)} offres à jour${job.counts.invalid ? ` · ${formatNumber(job.counts.invalid)} ignorées` : ""}`}
      onPress={() => router.push({ pathname: "/sourcing-imports/[id]", params: { id: job.id } })}
      last={last}
    />
  );
}

/** « Bien démarrer » : étapes réelles de configuration, affichées tant qu'il en reste. */
export function SetupChecklist({ hasProducts, hasChannel, hasSupplier, hasCosts }: { hasProducts: boolean; hasChannel: boolean | null; hasSupplier: boolean; hasCosts: boolean | null }) {
  const steps = [
    { key: "product", done: hasProducts, icon: Plus, title: "Ajouter vos produits", detail: "Saisie, voix ou code-barres", go: () => router.push("/product/new") },
    { key: "channel", done: hasChannel === true, icon: WalletCards, title: "Connecter eBay", detail: "Ventes et stock synchronisés", go: () => router.push("/ebay") },
    { key: "supplier", done: hasSupplier, icon: Library, title: "Brancher un fournisseur", detail: "Compte pro, catalogue ou source publique", go: () => router.push("/pro-accounts") },
    { key: "costs", done: hasCosts === true, icon: ScanSearch, title: "Régler vos coûts", detail: "TVA, emballage, retours : des marges complètes", go: () => router.push("/radar/settings") },
  ].filter((s) => !(s.key === "channel" && hasChannel === null) && !(s.key === "costs" && hasCosts === null));
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const todo = steps.filter((s) => !s.done);
  return (
    <View style={{ gap: space[2] }}>
      <SectionHeader title="Bien démarrer" />
      <Card testID="setup-checklist">
        <View style={{ padding: space[4], paddingBottom: space[3], gap: space[2] }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Txt variant="body">Configuration</Txt>
            <Txt variant="label" num>
              {done} / {steps.length}
            </Txt>
          </View>
          <ProgressBar value={done} max={steps.length} tone="success" label={`Configuration : ${done} étapes sur ${steps.length}`} />
        </View>
        {todo.map((s, i) => (
          <ActionRow key={s.key} icon={s.icon} tone="neutral" title={s.title} detail={s.detail} onPress={s.go} last={i === todo.length - 1} />
        ))}
      </Card>
    </View>
  );
}
