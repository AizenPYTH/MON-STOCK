import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Download, Inbox, PackageOpen, Plus, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Alert, Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Checkbox, Field, FormError, FormSuccess, Input, Select, Textarea } from "@/components/ui/form";
import { Kbd } from "@/components/ui/kbd";
import { DescriptionList, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton, SkeletonText, StatTileSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { LinkTabs } from "@/components/ui/tabs";
import { FilterBar, SearchInput, Toolbar } from "@/components/ui/toolbar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  DayBars,
  DemoBadge,
  FilterChip,
  LegendKey,
  LevelDot,
  MarginWaterfall,
  MarketRuler,
  MonoTitle,
  Panel,
  ScoreBar,
  SceneHeader,
  Segmented,
  SplitBar,
  StageFigure,
  StageStats,
  StockBarcode,
  ToneIcon,
} from "@/components/instrument";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { InteractiveDemo } from "./demo-client";

export const metadata: Metadata = { title: "Système de design (dev)", robots: { index: false, follow: false } };

const HERE = "/dev/design-system";

/** Kit de démonstration, réservé au développement (404 en production). */
export default async function DesignSystemPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { view } = await searchParams;
  const compare = view === "compare";
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="bg-night text-on-night">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-gutter py-5">
          <div className="min-w-0">
            <div className="ms-mono text-[11px] leading-[14px] text-on-night-muted">MON STOCK · développement</div>
            <h1 className="mt-1 text-h1 text-on-night">Système de design « Instrument »</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Affichage"
              options={[
                { href: HERE, label: "Thème courant", selected: !compare },
                { href: `${HERE}?view=compare`, label: "Clair + sombre", selected: compare },
              ]}
            />
            <ThemeToggle onNight />
          </div>
        </div>
      </header>
      {compare ? (
        <>
          <ThemeFrame theme="light" />
          <ThemeFrame theme="dark" />
        </>
      ) : (
        <Kit />
      )}
    </main>
  );
}

function ThemeFrame({ theme }: { theme: "light" | "dark" }) {
  return (
    <div data-theme={theme} className="bg-background">
      <div className="mx-auto max-w-6xl px-gutter pt-8">
        <Badge variant="accent" size="md">
          Thème {theme === "light" ? "clair" : "sombre"} (data-theme=&quot;{theme}&quot;)
        </Badge>
      </div>
      <Kit />
    </div>
  );
}

function Block({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <SectionHeader title={title} description={description} />
      {children}
    </section>
  );
}

function Swatch({ name, varName, text }: { name: string; varName: string; text?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex h-14 items-center justify-center rounded-xl border border-border text-sm font-bold" style={{ background: `var(${varName})`, color: text ? `var(${text})` : undefined }}>
        {text ? "Aa 12,5" : null}
      </div>
      <div className="mt-1.5 truncate text-xs font-bold text-foreground">{name}</div>
      <div className="ms-code truncate text-[10.5px] text-ink-3">{varName}</div>
    </div>
  );
}

const ROWS = [
  { sku: "IP13-128-MN-A", name: "iPhone 13 128 Go Minuit · Grade A", qty: 12, cost: 389, price: 479, level: "ok" as const },
  { sku: "IP14P-256-VI-B", name: "iPhone 14 Pro 256 Go Violet · Grade B", qty: 2, cost: 712, price: 829, level: "low" as const },
  { sku: "ECR-IP13-OLED", name: "Écran iPhone 13 OLED (pièce)", qty: 0, cost: 64.5, price: null, level: "out" as const },
  { sku: "BAT-IP12", name: "Batterie iPhone 12 · capacité 100 %", qty: 31, cost: 14.2, price: 29.9, level: "ok" as const },
];

const LEVEL = { ok: { tone: "success" as const, label: "En stock" }, low: { tone: "warning" as const, label: "Stock faible" }, out: { tone: "danger" as const, label: "Rupture" } };

function DemoTable({ density, stack, sticky }: { density?: "comfortable" | "compact"; stack?: boolean; sticky?: boolean }) {
  return (
    <Table density={density} stackOnMobile={stack} stickyHeader={sticky ? "220px" : false} caption="Références en stock (exemple)">
      <THead>
        <tr>
          <TH scope="col">Référence</TH>
          <TH scope="col">État</TH>
          <TH scope="col" align="right">
            Qté
          </TH>
          <TH scope="col" align="right">
            Coût
          </TH>
          <TH scope="col" align="right">
            Prix eBay
          </TH>
        </tr>
      </THead>
      <TBody>
        {[...ROWS, ...(sticky ? ROWS.map((r) => ({ ...r, sku: `${r.sku}-2` })) : [])].map((r, i) => (
          <TR key={r.sku} aria-selected={i === 1 && !sticky ? true : undefined}>
            <TD primary label="Référence">
              <div className="min-w-0">
                <div className="font-bold text-foreground">{r.name}</div>
                <div className="ms-code text-[11px] text-ink-3">{r.sku}</div>
              </div>
            </TD>
            <TD label="État">
              <StatusBadge tone={LEVEL[r.level].tone}>{LEVEL[r.level].label}</StatusBadge>
            </TD>
            <TD align="right" label="Qté" className={cn("font-bold", r.qty === 0 && "text-danger")}>
              {r.qty}
            </TD>
            <TD align="right" label="Coût">
              {formatMoney(r.cost, "EUR", { decimals: 2 })}
            </TD>
            <TD align="right" label="Prix eBay" className={r.price === null ? "text-ink-3" : "font-semibold"}>
              {formatMoney(r.price, "EUR", { decimals: 2 })}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function Kit() {
  return (
    <div className="mx-auto max-w-6xl space-y-14 px-gutter py-10">
      {/* ------------------------------------------------------------ Jetons */}
      <Block title="Couleurs" description="Surfaces, textes, états (soft / ink / line / strong), signaux et scène nuit. Chaque couple texte / fond est mesuré (docs/design/DESIGN-SYSTEM.md).">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Swatch name="Papier" varName="--background" text="--foreground" />
          <Swatch name="Surface 1" varName="--surface" text="--foreground" />
          <Swatch name="Surface 2" varName="--surface-2" text="--muted" />
          <Swatch name="Surface 3" varName="--surface-3" text="--ink-3" />
          <Swatch name="Sélection" varName="--selection" text="--foreground" />
          <Swatch name="Inverse" varName="--inverse" text="--on-inverse" />
          <Swatch name="Succès" varName="--success-soft" text="--success-ink" />
          <Swatch name="Avertissement" varName="--warning-soft" text="--warning-ink" />
          <Swatch name="Danger" varName="--danger-soft" text="--danger-ink" />
          <Swatch name="Info" varName="--info-soft" text="--info-ink" />
          <Swatch name="Danger plein" varName="--danger-strong" text="--on-danger-strong" />
          <Swatch name="Interactif" varName="--interactive-soft" text="--interactive" />
          <Swatch name="Nuit" varName="--night" text="--on-night" />
          <Swatch name="Nuit relevée" varName="--night-raised" text="--on-night-muted" />
          <Swatch name="Menthe" varName="--mint" text="--night" />
          <Swatch name="Ambre" varName="--amber" text="--night" />
          <Swatch name="Rouge (signal)" varName="--red" />
          <Swatch name="Contour de champ" varName="--border-control" />
        </div>
        <Card>
          <CardContent className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            <p className="text-foreground">
              <b>Primaire</b> — foreground · texte courant
            </p>
            <p className="text-muted-strong">
              <b>Secondaire appuyé</b> — muted-strong
            </p>
            <p className="text-muted">
              <b>Secondaire</b> — muted · descriptions
            </p>
            <p className="text-ink-3">
              <b>Tertiaire</b> — ink-3 · métadonnées, étiquettes
            </p>
            <p className="text-ink-4">
              <b>Désactivé</b> — ink-4 · non porteur d'information
            </p>
            <p>
              <a href="#liens" className="font-semibold text-interactive underline underline-offset-4 hover:text-interactive-hover">
                Lien dans le texte
              </a>{" "}
              — interactive
            </p>
          </CardContent>
        </Card>
      </Block>

      <Block title="Typographie" description="Manrope pour le texte, Geist Mono pour les étiquettes et les codes ; chiffres tabulaires partout.">
        <Card>
          <CardContent className="space-y-3">
            <div className="text-display">Display 40/46</div>
            <div className="text-h1">Titre h1 28/34</div>
            <div className="text-h2">Titre h2 20/26</div>
            <div className="text-h3">Titre h3 15/20</div>
            <p className="text-body font-medium">Corps 14/20 — Les prix fournisseurs sont actualisés chaque nuit ; l'âge d'un prix est toujours affiché.</p>
            <p className="text-small text-muted">Petit 13/18 — texte d'aide sous un champ.</p>
            <p className="text-caption text-muted">Légende 12/16 — mention discrète.</p>
            <p className="ms-mono text-mono-label text-ink-3">Étiquette mono 10,5/14 · ventes 30 j</p>
            <p className="ms-code text-sm">SKU IP13-128-MN-A · 1 234,56 €</p>
          </CardContent>
        </Card>
      </Block>

      <Block title="Rayons et élévations" description="Badge 6 · contrôle compact 10 · champ/bouton 12 · carte 16 · feuille 24. Ombres uniquement sur ce qui flotte.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[
            ["rounded-badge", "6"],
            ["rounded-control", "10"],
            ["rounded-field", "12"],
            ["rounded-card", "16"],
            ["rounded-sheet", "24"],
          ].map(([cls, px]) => (
            <div key={cls} className={cn("flex h-20 items-end border border-border-strong bg-surface p-3 text-xs font-bold", cls)}>
              {px} px
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm font-semibold shadow-raised">shadow-raised · pouce, barre collante</div>
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm font-semibold shadow-floating">shadow-floating · menu, toast</div>
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm font-semibold shadow-modal">shadow-modal · dialogue, panneau</div>
        </div>
      </Block>

      {/* ------------------------------------------------------------ Actions */}
      <Block title="Boutons" description="Une seule action principale (menthe) par zone. Tailles sm 32 (40 au doigt) / md 40 / lg 48 / xl 52.">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button>
                <Plus aria-hidden="true" className="h-4 w-4" /> Ajouter un produit
              </Button>
              <Button variant="secondary">
                <Download aria-hidden="true" className="h-4 w-4" /> Exporter
              </Button>
              <Button variant="ghost">Annuler</Button>
              <Button variant="dark">
                <Search aria-hidden="true" className="h-4 w-4" /> Chercher une offre
              </Button>
              <Button variant="danger">Supprimer</Button>
              <Button variant="link">Voir l'historique</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">Petit</Button>
              <Button size="md">Moyen</Button>
              <Button size="lg">Grand</Button>
              <Button size="xl">Très grand</Button>
              <Button variant="secondary" iconOnly aria-label="Filtres">
                <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
              </Button>
              <Button variant="secondary" size="sm" iconOnly aria-label="Actualiser">
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled>Désactivé</Button>
              <Button variant="secondary" disabled>
                Désactivé
              </Button>
              <Button loading loadingText="Enregistrement…">
                Enregistrer
              </Button>
              <Button variant="secondary" loading>
                Synchroniser
              </Button>
              <ButtonLink href={HERE} variant="secondary">
                Lien-bouton interne
              </ButtonLink>
              <ButtonLink href="javascript:alert(1)" variant="secondary">
                URL non sûre (neutralisée)
              </ButtonLink>
            </div>
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-night p-4">
          <Button>Action sur la scène</Button>
          <Button variant="night">Secondaire nuit</Button>
          <Kbd onNight>⌘ K</Kbd>
          <DemoBadge />
        </div>
        <InteractiveDemo />
      </Block>

      {/* ------------------------------------------------------------ Statuts */}
      <Block title="Badges et statuts" description="Un statut = icône + texte, jamais la couleur seule.">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="success">En stock</StatusBadge>
              <StatusBadge tone="warning">Stock faible</StatusBadge>
              <StatusBadge tone="danger">Rupture</StatusBadge>
              <StatusBadge tone="info">Brouillon eBay</StatusBadge>
              <StatusBadge tone="neutral">Archivé</StatusBadge>
              <StatusBadge tone="pending">Synchronisation en attente</StatusBadge>
              <StatusBadge tone="success" size="md">
                Connecté
              </StatusBadge>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <StatusBadge tone="success" variant="plain">
                Marge +18 %
              </StatusBadge>
              <StatusBadge tone="danger" variant="plain">
                Perte −12 €
              </StatusBadge>
              <LevelDot tone="ok">En stock</LevelDot>
              <LevelDot tone="low">Faible</LevelDot>
              <LevelDot tone="out">Rupture</LevelDot>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                <StatusDot tone="info" /> Information
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Neutre</Badge>
              <Badge variant="success">Succès</Badge>
              <Badge variant="warning">Avertissement</Badge>
              <Badge variant="danger">Danger</Badge>
              <Badge variant="info">Info</Badge>
              <Badge variant="accent">Accent</Badge>
              <Badge variant="outline">Contour</Badge>
              <Badge size="md" variant="info">
                Moyen
              </Badge>
              <DemoBadge onNight={false} />
              <span className="text-sm text-muted">
                Rechercher <Kbd>/</Kbd> · palette <Kbd>⌘ K</Kbd> · fermer <Kbd>Échap</Kbd>
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <ToneIcon tone="danger">
                <PackageOpen />
              </ToneIcon>
              <ToneIcon tone="warning">
                <PackageOpen />
              </ToneIcon>
              <ToneIcon tone="success">
                <PackageOpen />
              </ToneIcon>
              <ToneIcon tone="info">
                <PackageOpen />
              </ToneIcon>
              <ToneIcon tone="neutral">
                <PackageOpen />
              </ToneIcon>
            </div>
          </CardContent>
        </Card>
      </Block>

      {/* ------------------------------------------------------------ Formulaires */}
      <Block title="Formulaires" description="Contour ≥ 3:1, focus bleu + halo, erreur reliée au champ (aria-describedby), 16 px au doigt.">
        <Card>
          <CardHeader title="Nouveau produit" description="Les champs marqués * sont obligatoires." />
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom" htmlFor="ds-name" hint="Tel qu'il apparaîtra dans vos listes.">
              <Input id="ds-name" placeholder="ex. iPhone 13 128 Go Minuit" required />
            </Field>
            <Field label="Prix d'achat" htmlFor="ds-cost" error="Saisissez un montant positif.">
              <Input id="ds-cost" inputMode="decimal" defaultValue="-4" />
            </Field>
            <Field label="État" htmlFor="ds-grade">
              <Select id="ds-grade" defaultValue="A">
                <option value="A">Grade A</option>
                <option value="B">Grade B</option>
                <option value="C">Grade C</option>
              </Select>
            </Field>
            <Field label="Fournisseur (désactivé)" htmlFor="ds-sup">
              <Input id="ds-sup" disabled defaultValue="Atelier Mobile Lyon" />
            </Field>
            <Field label="Notes" htmlFor="ds-notes" className="sm:col-span-2">
              <Textarea id="ds-notes" placeholder="Rayures légères au dos, batterie 91 %." />
            </Field>
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <Checkbox defaultChecked /> Publier sur eBay
            </label>
            <div className="space-y-2 sm:col-span-2">
              <FormError message="Impossible d'enregistrer : la connexion a expiré." action={{ label: "Se reconnecter", href: "/login" }} />
              <FormSuccess message="Produit enregistré." />
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="ghost">Annuler</Button>
            <Button>Enregistrer</Button>
          </CardFooter>
        </Card>
      </Block>

      {/* ------------------------------------------------------------ Motifs de page */}
      <Block title="Motif de page liste" description="En-tête de page → onglets → barre de filtres → tableau → pagination.">
        <div className="rounded-3xl border border-border bg-background p-4 sm:p-6">
          <PageHeader
            eyebrow="Stock"
            title="Références"
            description="Toutes vos références, tous canaux confondus. Les quantités eBay sont synchronisées toutes les 15 minutes."
            actions={
              <>
                <Button variant="secondary">
                  <Download aria-hidden="true" className="h-4 w-4" /> Exporter
                </Button>
                <Button>
                  <Plus aria-hidden="true" className="h-4 w-4" /> Ajouter
                </Button>
              </>
            }
          />
          <LinkTabs
            current={HERE}
            items={[
              { href: HERE, label: "Toutes", count: 248 },
              { href: `${HERE}?t=low`, label: "Stock faible", count: 12 },
              { href: `${HERE}?t=out`, label: "Ruptures", count: 3 },
              { href: `${HERE}?t=archived`, label: "Archivées" },
            ]}
          />
          <div className="space-y-3">
            <Toolbar actions={<Segmented label="Densité" options={[{ href: HERE, label: "Confort", selected: true }, { href: `${HERE}?d=compact`, label: "Compact", selected: false }]} />}>
              <SearchInput placeholder="Rechercher une référence…" wrapperClassName="w-full sm:w-72" />
              <Select defaultValue="" className="w-40">
                <option value="">Marque</option>
                <option value="apple">Apple</option>
                <option value="samsung">Samsung</option>
              </Select>
            </Toolbar>
            <FilterBar summary="248 références" resetHref={HERE} active>
              <FilterChip href={HERE} selected count={248}>
                Toutes
              </FilterChip>
              <FilterChip href={`${HERE}?l=low`} selected={false} count={12} dot="var(--amber)">
                Faible
              </FilterChip>
              <FilterChip href={`${HERE}?l=out`} selected={false} count={3} dot="var(--red)">
                Rupture
              </FilterChip>
            </FilterBar>
            <DemoTable stack />
            <Pagination page={2} pageSize={50} total={248} makeHref={(p) => `${HERE}?page=${p}`} />
          </div>
        </div>
      </Block>

      <Block title="Tableau compact et en-tête collant" description="density=&quot;compact&quot; pour les grandes listes ; stickyHeader pour une zone défilante.">
        <div className="grid gap-4">
          <DemoTable density="compact" />
          <DemoTable sticky />
        </div>
      </Block>

      {/* ------------------------------------------------------------ Données */}
      <Block title="Indicateurs" description="Valeur inconnue = « — », jamais 0. « ≈ » = estimation. Évolution = icône + texte.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="CA 30 jours" value="18 452" unit="€" delta={{ value: "+12 %", direction: "up", tone: "success", label: "vs 30 j préc." }} />
          <StatTile label="Marge estimée" value="4 210" unit="€" approx hint="Frais eBay inclus, port estimé" tone="success" />
          <StatTile label="Ruptures" value={3} tone="danger" delta={{ value: "+2", direction: "up", tone: "danger" }} href={HERE} />
          <StatTile label="Délai fournisseur" value={null} hint="Aucune commande reçue" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTileSkeleton />
          <Card>
            <CardContent>
              <DescriptionList
                items={[
                  { label: "SKU", value: <span className="ms-code">IP13-128-MN-A</span> },
                  { label: "Prix fournisseur", value: "389,00 € · il y a 2 jours" },
                ]}
              />
            </CardContent>
          </Card>
          <Panel className="p-4">
            <MonoTitle title="Score de l'offre" count={82} aside="mis à jour il y a 3 h" />
            <ScoreBar score={82} className="mt-3" />
          </Panel>
        </div>
      </Block>

      <Block title="Scène nuit et graphiques" description="La scène porte LE chiffre de la page et au plus un graphique ; le papier remonte de 24 px.">
        <div className="overflow-hidden rounded-3xl border border-border">
          <section className="bg-night px-5 pb-12 pt-5 text-on-night sm:px-8">
            <SceneHeader eyebrow="Tableau de bord" title="Aujourd'hui" description="Valeur du stock au coût d'achat" back={{ href: HERE, label: "Retour" }} />
            <div className="mt-4">
              <StageFigure value="≈ 48 210 €" size="lg" />
            </div>
            <div className="mt-5">
              <StockBarcode
                label="Code-barres du stock : 9 références"
                items={[
                  { id: "a", weight: 9, level: "ok" },
                  { id: "b", weight: 7, level: "ok" },
                  { id: "c", weight: 5, level: "low" },
                  { id: "d", weight: 4, level: "ok" },
                  { id: "e", weight: 3, level: "out" },
                  { id: "f", weight: 2, level: "ok" },
                  { id: "g", weight: 1, level: "low" },
                  { id: "h", weight: 0, level: "ok" },
                  { id: "i", weight: 0, level: "ok" },
                ]}
              />
              <div className="mt-2 flex flex-wrap gap-4">
                <LegendKey color="color-mix(in srgb, var(--on-night) 86%, transparent)" label="En stock" />
                <LegendKey color="var(--amber)" label="Faible" />
                <LegendKey color="var(--danger-on-night)" label="Rupture" />
              </div>
            </div>
            <StageStats
              className="mt-6"
              stats={[
                { label: "Ventes 7 j", value: "1 284 €", tone: "mint" },
                { label: "À réassortir", value: "12", note: "dont 3 ruptures", tone: "warning" },
                { label: "Délai moyen", value: null },
              ]}
            />
            <div className="mt-6">
              <DayBars label="CA des 14 derniers jours" days={Array.from({ length: 14 }, (_, i) => ({ day: `J-${13 - i}`, amount: [3, 5, 2, 8, 6, 4, 9, 7, 5, 10, 6, 8, 4, 7][i] ?? 0 }))} height={72} />
            </div>
          </section>
          <div className="relative -mt-6 space-y-4 rounded-t-3xl bg-background shadow-[inset_0_1px_0_var(--paper-edge)] px-5 pb-8 pt-6 sm:px-8">
            <MonoTitle title="Offres rapprochées" count={2} aside="prix il y a 2 jours" />
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel className="space-y-3 p-4">
                <div className="text-sm font-bold">Coût rendu face au marché</div>
                <MarketRuler cost={420} market={480} resale={520} caption="Coût 420 € · marché 480 € · revente 520 €" large />
                <MarketRuler cost={null} market={null} emptyCaption="Pas assez de ventes comparables" />
              </Panel>
              <MarginWaterfall
                format={(n) => formatMoney(n, "EUR")}
                lines={[
                  { label: "Prix de revente", amount: 520, kind: "base" },
                  { label: "Frais eBay", note: "12,9 % + 0,35 €", amount: 67, kind: "minus" },
                  { label: "Port", amount: null, kind: "minus" },
                  { label: "Coût d'achat", amount: 420, kind: "minus" },
                  { label: "Marge", amount: 33, kind: "result" },
                ]}
              />
            </div>
            <SplitBar
              segments={[
                { label: "Importées", value: 412, color: "var(--success-strong)" },
                { label: "Ignorées", value: 38, color: "var(--ink-4)" },
                { label: "À vérifier", value: 21, color: "var(--amber)" },
                { label: "Erreurs", value: 4, color: "var(--red)" },
              ]}
            />
          </div>
        </div>
      </Block>

      {/* ------------------------------------------------------------ Retours */}
      <Block title="Messages, états vides et erreurs">
        <div className="grid gap-3">
          <Callout tone="info" title="Synchronisation eBay">
            Les commandes des 90 derniers jours sont importées à la première connexion.
          </Callout>
          <Callout tone="warning" title="3 références sans prix d'achat" action={<Button size="sm" variant="secondary">Compléter</Button>}>
            Leur marge reste « provisoire » tant que le coût n'est pas saisi.
          </Callout>
          <Alert tone="danger" title="Échec de l'import">
            Le fichier ne contient pas de colonne « Prix ». Aucune ligne n'a été importée.
          </Alert>
          <Callout tone="success">Catalogue fournisseur importé : 412 lignes.</Callout>
          <Callout tone="neutral" title="Astuce">
            Appuyez sur <Kbd>/</Kbd> pour rechercher depuis n'importe quelle page.
          </Callout>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <EmptyState
            icon={<Inbox />}
            title="Aucune commande pour l'instant"
            description="Connectez votre compte eBay pour importer vos ventes, ou saisissez une vente manuellement."
            action={<Button>Connecter eBay</Button>}
            secondaryAction={<Button variant="ghost">Saisir une vente</Button>}
          />
          <ErrorState action={<Button variant="secondary">Réessayer</Button>} details="Référence : 4f2a9c" />
        </div>
        <Card>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <SkeletonText lines={3} />
            </div>
            <TableSkeleton rows={3} />
          </CardContent>
        </Card>
      </Block>
    </div>
  );
}
