import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { DayBars, LegendKey, LevelDot, MarginWaterfall, MarketRuler, StageFigure, StockBarcode } from "@/components/instrument";
import { LEGAL } from "@/content/legal";
import { EXAMPLE_BARCODE, EXAMPLE_COVERAGE, EXAMPLE_DAYS, EXAMPLE_IMPORT, EXAMPLE_OFFER, EXAMPLE_TODAY, EXAMPLE_WATERFALL } from "@/components/public/example-data";

export const metadata: Metadata = {
  title: { absolute: "MON STOCK — le centre de contrôle du vendeur multicanal" },
  description: "Pour les revendeurs de téléphones et de pièces détachées sur eBay et en boutique : stock, ventes, prix fournisseurs et réapprovisionnement au même endroit, avec des chiffres honnêtes.",
};

const euro = (n: number) => `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} €`;
const int = (n: number) => new Intl.NumberFormat("fr-FR").format(n);

/** Étiquette « Exemple » : toute valeur de l'accueil est une illustration, jamais une donnée réelle. */
function ExampleTag({ onNight = false }: { onNight?: boolean }) {
  return <span className={onNight ? "ms-code shrink-0 rounded-[5px] bg-amber/14 px-[7px] py-0.5 text-[10px] font-semibold tracking-[0.08em] text-amber" : "ms-code shrink-0 rounded-[5px] bg-warning-soft px-[7px] py-0.5 text-[10px] font-semibold tracking-[0.06em] text-warning-ink"}>EXEMPLE</span>;
}

const FAQ = [
  {
    q: "Faut-il connecter eBay pour commencer ?",
    a: "Non. Vous pouvez créer vos produits, importer des catalogues fournisseurs et utiliser les outils sans eBay. La connexion eBay passe par l'autorisation officielle (OAuth) : aucun mot de passe eBay n'est demandé ni stocké.",
  },
  {
    q: "D'où viennent les prix fournisseurs ?",
    a: "Des comptes professionnels que vous connectez, des catalogues que vous importez (CSV, Excel, XML, JSON) et de sources publiques autorisées. Chaque prix garde sa source et son âge ; rien n'est inventé.",
  },
  {
    q: "Mes identifiants fournisseurs sont-ils protégés ?",
    a: "Ils sont chiffrés côté serveur, vérifiés par un test réel auprès du fournisseur, et ne sont jamais renvoyés à l'application ni écrits dans les journaux. Un administrateur peut déconnecter un compte à tout moment.",
  },
  {
    q: "Combien ça coûte ?",
    a: "La facturation n'est pas encore ouverte : aucun plan payant n'est proposé pour l'instant et aucune carte bancaire n'est demandée.",
  },
  {
    q: "Puis-je essayer sans mes données ?",
    a: "Oui : créez une organisation de démonstration. Elle est séparée de vos données et marquée « DÉMO » sur chaque écran.",
  },
] as const;

/** Outils réellement disponibles dans l'application (section Outils). */
const TOOLS = [
  { glyph: "%", label: "TVA" },
  { glyph: "+€", label: "Marge" },
  { glyph: "€", label: "Prix" },
  { glyph: "eB", label: "Frais eBay" },
  { glyph: "−%", label: "Remise" },
  { glyph: "$€", label: "Devises" },
  { glyph: "kg", label: "Port" },
] as const;

/** Mise en route réelle (aucune promesse au-delà de ce que fait le produit aujourd'hui). */
const START_STEPS = [
  { title: "Créez votre compte", text: "Un e-mail et un mot de passe. Le même compte servira sur le web et sur iPhone." },
  { title: "Votre organisation, ou la démo", text: "Créez votre organisation, ou explorez une organisation de démonstration aux données fictives, marquée « DÉMO »." },
  { title: "Branchez vos sources", text: "Connectez eBay par l'autorisation officielle, importez un catalogue fournisseur ou saisissez vos produits." },
] as const;

export default function HomePage() {
  return (
    <>
      {/* Scène : promesse + composition d'exemple faite des vrais composants Instrument */}
      <section className="bg-night text-on-night">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-16 gap-y-12 px-4 pb-[104px] pt-10 sm:px-6 lg:px-12 lg:pt-14">
          <div className="flex min-w-0 max-w-[640px] flex-[1_1_520px] flex-col gap-5">
            <p className="ms-mono text-[11px] leading-[14px] tracking-[0.07em] text-on-night-muted">Stock · ventes · sourcing · réapprovisionnement</p>
            <h1 className="text-balance text-[38px] font-extrabold leading-[42px] tracking-[-1.2px] text-on-night sm:text-[48px] sm:leading-[52px] lg:text-[56px] lg:leading-[60px] lg:tracking-[-1.8px]">Le centre de contrôle du vendeur multicanal.</h1>
            <p className="max-w-[560px] text-pretty text-base font-medium leading-[26px] text-on-night-muted sm:text-[18px] sm:leading-7">
              Pour les revendeurs de téléphones et de pièces détachées qui vendent sur eBay et en boutique : votre stock, vos ventes, les prix de vos fournisseurs et ce qu&apos;il faut racheter, au même endroit. Aucune fausse donnée : ce qui est estimé est marqué comme tel.
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2.5">
              {/* prefetch={false} (W-01) : /login et /signup redirigent selon l'état du compte. */}
              <Link href="/signup" prefetch={false} className="inline-flex min-h-[52px] items-center gap-2 rounded-xl bg-mint px-[22px] text-base font-extrabold text-night transition-colors hover:bg-mint-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint">
                Créer un compte
                <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={2.4} />
              </Link>
              <Link href="/login" prefetch={false} className="inline-flex min-h-[52px] items-center rounded-xl bg-night-raised px-5 text-base font-extrabold text-on-night transition-colors hover:bg-night-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-night">
                Se connecter
              </Link>
            </div>
            <p className="text-[13px] font-semibold leading-[18px] text-on-night-subtle">Service en phase de test. Essai possible sur une organisation de démonstration, marquée « DÉMO » sur chaque écran.</p>
          </div>

          <figure aria-label="Exemple d'écran « Aujourd'hui », avec des valeurs d'exemple" className="min-w-0 max-w-[600px] flex-[1_1_480px] rounded-3xl border border-night-line bg-night-deep p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="ms-mono text-[11px] leading-[14px] tracking-[0.07em] text-on-night-muted">Chiffre d&apos;affaires du jour</span>
              <ExampleTag onNight />
            </div>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <StageFigure value={EXAMPLE_TODAY.revenue} size="xl" className="max-sm:[&>span:nth-child(1)]:text-[52px]" />
              <div className="w-[190px] max-w-full pb-1.5">
                <DayBars days={EXAMPLE_DAYS} height={48} label="Exemple : chiffre d'affaires des 14 derniers jours" />
                <div className="ms-mono mt-1.5 flex justify-between text-[9.5px] leading-3 text-on-night-subtle">
                  <span>14 j</span>
                  <span className="text-mint">Auj. en cours</span>
                </div>
              </div>
            </div>
            <dl className="mt-[18px] grid grid-cols-3 border-t border-night-line">
              <div className="min-w-0 pt-3">
                <dt className="ms-mono truncate text-[10px] leading-[13px] text-on-night-subtle">Ventes</dt>
                <dd className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-[17px] font-bold text-on-night">
                  {EXAMPLE_TODAY.sales} <span className="text-xs font-semibold text-amber">{EXAMPLE_TODAY.toShip}</span>
                </dd>
              </div>
              <div className="min-w-0 border-l border-night-line pl-3.5 pt-3">
                <dt className="ms-mono truncate text-[10px] leading-[13px] text-on-night-subtle">Marge estimée</dt>
                <dd className="mt-1 text-[17px] font-bold text-on-night">
                  <span className="font-medium text-on-night-subtle">≈ </span>
                  {EXAMPLE_TODAY.margin}
                </dd>
              </div>
              <div className="min-w-0 border-l border-night-line pl-3.5 pt-3">
                <dt className="ms-mono truncate text-[10px] leading-[13px] text-on-night-subtle">Hier, journée</dt>
                <dd className="mt-1 text-[17px] font-bold text-on-night">{EXAMPLE_TODAY.yesterday}</dd>
              </div>
            </dl>
            <div className="mt-[22px] flex flex-col gap-2.5 border-t border-night-line pt-4">
              <span className="ms-mono text-[11px] leading-[14px] tracking-[0.07em] text-on-night-muted">Stock · {EXAMPLE_TODAY.references} réf. · une barre par référence</span>
              <StockBarcode items={EXAMPLE_BARCODE} height={44} label="Exemple : code-barres du stock, une barre par référence" />
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
                <LegendKey color="var(--danger-on-night)" label={`${EXAMPLE_TODAY.out} ruptures`} />
                <LegendKey color="var(--amber)" label={`${EXAMPLE_TODAY.low} faibles`} />
                <span className="ms-mono ml-auto text-[10px] leading-[13px] text-on-night-subtle">Largeur = ventes 30 j</span>
              </div>
            </div>
          </figure>
        </div>
      </section>

      <div className="-mt-6 rounded-t-3xl bg-background">
        {/* Fonctionnalités */}
        <section id="fonctionnalites" aria-labelledby="fonctionnalites-titre" className="mx-auto flex w-full max-w-[1280px] scroll-mt-6 flex-col gap-7 px-4 pb-6 pt-12 sm:px-6 lg:px-12 lg:pt-16">
          <div className="flex max-w-[720px] flex-col gap-2">
            <p className="ms-mono text-[11px] leading-[14px] tracking-[0.07em] text-muted">Ce que fait MON STOCK</p>
            <h2 id="fonctionnalites-titre" className="text-balance text-[28px] font-extrabold leading-[34px] tracking-[-0.8px] text-foreground sm:text-[36px] sm:leading-[42px] sm:tracking-[-1px]">
              Le bureau du revendeur, sans tableur.
            </h2>
          </div>

          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FeatureCard title="Stock multicanal" text="Produits, variantes (capacité, couleur, grade) et SKU. Les ventes eBay sont synchronisées et déduites du stock une seule fois ; les ventes en boutique aussi.">
              <ExampleHead label="Couverture en jours" />
              <ul className="flex flex-col gap-2">
                {EXAMPLE_COVERAGE.map((r) => (
                  <li key={r.name} className="flex items-center gap-2.5 rounded-[10px] bg-surface px-2.5 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{r.name}</span>
                    <span className="text-[15px] font-bold tnum text-foreground">{r.qty}</span>
                    {r.tone === "ok" ? (
                      <span className="w-16 text-right text-[12.5px] font-semibold text-muted">{r.cover}</span>
                    ) : (
                      <LevelDot tone={r.tone} className={r.tone === "out" ? "w-16 justify-end text-[12.5px] text-danger" : "w-16 justify-end text-[12.5px] text-warning"}>
                        {r.cover}
                      </LevelDot>
                    )}
                  </li>
                ))}
              </ul>
            </FeatureCard>

            <FeatureCard title="Recherche fournisseurs et « bonne affaire »" text="Une recherche interroge vos comptes pro, vos catalogues importés et les sources publiques autorisées. Chaque offre est placée face à la médiane du marché, avec l'âge du prix.">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[14.5px] font-semibold text-foreground">{EXAMPLE_OFFER.title}</span>
                <span className="shrink-0 text-base font-extrabold text-foreground">
                  {EXAMPLE_OFFER.price} <span className="ms-code text-[10.5px] text-ink-3">HT</span>
                </span>
              </div>
              <MarketRuler cost={EXAMPLE_OFFER.cost} market={EXAMPLE_OFFER.market} caption={EXAMPLE_OFFER.caption} />
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-success-strong px-[7px] py-0.5 text-[10.5px] font-bold text-on-success-strong">Très intéressant</span>
                <span className="text-[13.5px] font-extrabold text-success">{EXAMPLE_OFFER.profit}</span>
                <span className="text-[11px] font-bold text-warning-ink">provisoire</span>
                <span className="ml-auto">
                  <ExampleTag />
                </span>
              </div>
            </FeatureCard>

            <FeatureCard title="Radar des ruptures" text="Vos ruptures et stocks faibles croisés avec les offres de vos fournisseurs : score sur 100, coût complet, scénarios de quantité. Le brouillon de commande n'est jamais envoyé sans vous.">
              <ExampleHead label="Calcul par unité" />
              <MarginWaterfall lines={EXAMPLE_WATERFALL} format={euro} />
            </FeatureCard>

            <FeatureCard title="Imports de catalogues" text="CSV, Excel, XML ou JSON reçus de vos fournisseurs : aperçu, correspondance des colonnes mémorisée, rapport ligne par ligne. Rien n'est enregistré avant votre confirmation.">
              <ExampleHead label={`${int(EXAMPLE_IMPORT.reduce((a, s) => a + s.value, 0))} lignes lues`} />
              <span className="flex h-3 w-full gap-[3px] overflow-hidden rounded-md" role="img" aria-label={`Exemple : ${EXAMPLE_IMPORT.map((s) => `${s.label} ${int(s.value)}`).join(", ")}`}>
                {EXAMPLE_IMPORT.map((s, i) => (
                  <span key={s.label} className="ms-grow-x block h-full min-w-1" style={{ flexGrow: s.value, background: s.color, animationDelay: `${i * 60}ms` }} />
                ))}
              </span>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] font-semibold text-muted">
                {EXAMPLE_IMPORT.map((s) => (
                  <li key={s.label} className="flex items-center gap-[7px]">
                    <span aria-hidden="true" className="h-[9px] w-[9px] rounded-[2px]" style={{ background: s.color }} />
                    {s.label}
                    <b className="ml-auto font-bold tnum text-foreground">{int(s.value)}</b>
                  </li>
                ))}
              </ul>
            </FeatureCard>
          </ul>

          <div className="flex flex-wrap items-center gap-x-10 gap-y-4 rounded-3xl border border-border bg-surface p-5 sm:p-6">
            <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
              <h3 className="text-[20px] font-extrabold tracking-[-0.3px] text-foreground">Outils du revendeur</h3>
              <p className="text-[15px] font-medium leading-[22px] text-muted">TVA, marge, prix de vente, remise, frais eBay, devises (taux BCE datés), comparateur de frais de port, suivi de colis.</p>
            </div>
            <ul aria-label="Outils disponibles" className="flex flex-[2_1_420px] flex-wrap gap-2">
              {TOOLS.map((t, i) => (
                <li key={t.glyph} title={t.label} className="flex flex-col items-center gap-1.5">
                  <span aria-hidden="true" className={i === 0 ? "flex h-14 w-14 items-center justify-center rounded-[14px] bg-inverse text-lg font-extrabold text-on-inverse" : "flex h-14 w-14 items-center justify-center rounded-[14px] border border-border-strong bg-surface-2 text-lg font-extrabold text-foreground"}>
                    {t.glyph}
                  </span>
                  <span className="ms-mono text-[9.5px] leading-3 text-ink-3">{t.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Données honnêtes */}
        <section aria-labelledby="honnete-titre" className="mx-auto w-full max-w-[1280px] px-4 py-10 sm:px-6 lg:px-12">
          <h2 id="honnete-titre" className="sr-only">
            Des chiffres qui disent ce qu&apos;ils savent
          </h2>
          <dl className="grid gap-5 border-t border-border pt-8 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            <HonestItem term={<span className="text-[22px] font-extrabold text-foreground">1 486 €</span>} text="Chiffre nu : une valeur certaine." />
            <HonestItem
              term={
                <span className="text-[22px] font-extrabold text-foreground">
                  <span className="opacity-55">≈ </span>21 %
                </span>
              }
              text="« ≈ » : une estimation, et pourquoi."
            />
            <HonestItem term={<span className="text-[22px] font-extrabold text-ink-3">—</span>} text="« — » : inconnu, jamais remplacé par 0." />
            <HonestItem term={<span className="text-[22px] font-extrabold text-warning">provisoire</span>} text="Une marge sans tous les coûts, signalée." />
            <HonestItem term={<span className="ms-code text-base leading-[30px] text-foreground">prix il y a 3 h</span>} text="L'âge de chaque prix reste visible." />
          </dl>
        </section>

        {/* Mise en route */}
        <section id="demarrer" aria-labelledby="demarrer-titre" className="mx-auto flex w-full max-w-[1280px] scroll-mt-6 flex-col gap-6 px-4 pb-10 pt-4 sm:px-6 lg:px-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex max-w-[640px] flex-col gap-2">
              <p className="ms-mono text-[11px] leading-[14px] tracking-[0.07em] text-muted">Mise en route</p>
              <h2 id="demarrer-titre" className="text-balance text-[26px] font-extrabold leading-8 tracking-[-0.8px] text-foreground sm:text-[32px] sm:leading-[38px]">
                Trois étapes, sans carte bancaire.
              </h2>
            </div>
            <Link href="/signup" prefetch={false} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-inverse px-5 text-[15px] font-extrabold text-on-inverse transition-colors hover:bg-inverse-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              Commencer
              <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={2.4} />
            </Link>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {START_STEPS.map((step, i) => (
              <li key={step.title} className="relative flex flex-col gap-2 rounded-3xl border border-border bg-surface p-5 sm:p-6">
                <span aria-hidden="true" className="ms-code text-[13px] font-semibold text-ink-3 tnum">
                  0{i + 1}
                </span>
                <h3 className="text-[18px] font-extrabold leading-6 tracking-[-0.2px] text-foreground">{step.title}</h3>
                <p className="text-[15px] font-medium leading-[22px] text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Sur iPhone */}
        <section id="iphone" aria-labelledby="iphone-titre" className="mx-auto w-full max-w-[1280px] scroll-mt-6 px-4 py-6 sm:px-6 lg:px-12">
          <div className="flex flex-wrap items-center gap-x-12 gap-y-8 rounded-3xl bg-night p-6 text-on-night sm:p-10">
            <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5">
              <p className="ms-mono text-[11px] leading-[14px] tracking-[0.07em] text-on-night-muted">Sur iPhone</p>
              <h2 id="iphone-titre" className="text-[26px] font-extrabold leading-8 tracking-[-0.8px] sm:text-[32px] sm:leading-[38px]">
                Le terrain sur iPhone, le bureau sur le web.
              </h2>
              <p className="text-base font-medium leading-6 text-on-night-muted">Même compte, mêmes données, même organisation. Ajustez un stock depuis la réserve, cherchez un prix chez vos fournisseurs, posez une question au conseiller à la voix.</p>
              <div className="mt-1.5 flex flex-wrap gap-2.5">
                <span className="whitespace-nowrap rounded-[10px] border border-night-stroke px-3 py-2 text-sm font-bold text-on-night">Bêta TestFlight · sur invitation</span>
                <span className="whitespace-nowrap rounded-[10px] border border-dashed border-night-stroke px-3 py-2 text-sm font-bold text-on-night-muted">App Store · à venir</span>
              </div>
              {LEGAL.contactEmail ? (
                <a href={`mailto:${LEGAL.contactEmail}?subject=${encodeURIComponent("Accès à l'application iPhone MON STOCK")}`} className="mt-1 inline-flex min-h-10 items-center self-start rounded-[10px] text-sm font-bold text-mint underline underline-offset-2 hover:text-on-night">
                  Demander une invitation TestFlight
                </a>
              ) : null}
            </div>
            <PhoneExample />
          </div>
        </section>

        {/* Questions */}
        <section id="faq" aria-labelledby="faq-titre" className="mx-auto flex w-full max-w-[880px] scroll-mt-6 flex-col gap-4 px-4 pb-[72px] pt-12 sm:px-6 lg:px-12">
          <h2 id="faq-titre" className="text-[28px] font-extrabold leading-[34px] tracking-[-0.8px] text-foreground sm:text-[32px] sm:leading-[38px]">
            Questions
          </h2>
          <div className="overflow-hidden rounded-3xl border border-border bg-surface">
            {FAQ.map((item, i) => (
              <details key={item.q} open={i === 0} className="group border-b border-line-soft last:border-b-0">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-4 transition-colors hover:bg-surface-2 focus-visible:-outline-offset-2 sm:px-[22px] [&::-webkit-details-marker]:hidden">
                  <span className="flex-1 text-base font-bold leading-[22px] text-foreground">{item.q}</span>
                  <ChevronDown aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-ink-3 transition-transform duration-150 group-open:rotate-180" strokeWidth={2.2} />
                </summary>
                <p className="px-5 pb-5 text-[15px] font-medium leading-[23px] text-muted sm:px-[22px]">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function FeatureCard({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <li className="flex min-w-0 flex-col gap-3.5 rounded-3xl border border-border bg-surface p-5 sm:p-6">
      <h3 className="text-[20px] font-extrabold leading-[26px] tracking-[-0.3px] text-foreground">{title}</h3>
      <p className="text-[15px] font-medium leading-[22px] text-muted">{text}</p>
      <div className="mt-auto flex min-w-0 flex-col gap-2.5 rounded-2xl bg-background p-3.5">{children}</div>
    </li>
  );
}

function ExampleHead({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="ms-mono text-[10px] leading-[13px] text-ink-3">{label}</span>
      <ExampleTag />
    </div>
  );
}

function HonestItem({ term, text }: { term: ReactNode; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt>{term}</dt>
      <dd className="text-[13.5px] font-semibold leading-[19px] text-muted">{text}</dd>
    </div>
  );
}

/** Cadre iPhone (pas de capture fournie) : mini écran « Aujourd'hui » fait des mêmes composants, étiqueté « Exemple ». */
function PhoneExample() {
  return (
    <figure aria-label="Exemple d'écran Aujourd'hui sur iPhone, avec des valeurs d'exemple" className="mx-auto flex h-[420px] w-[260px] shrink-0 flex-col gap-3 rounded-[36px] border border-night-stroke bg-night-deep px-5 pb-6 pt-8">
      <div className="flex items-center justify-between">
        <span className="ms-mono text-[10px] leading-[13px] text-on-night-subtle">Aujourd&apos;hui</span>
        <ExampleTag onNight />
      </div>
      <StageFigure value={EXAMPLE_TODAY.revenue} size="sm" />
      <DayBars days={EXAMPLE_DAYS} height={56} label="Exemple : chiffre d'affaires des 14 derniers jours" />
      <div className="mt-auto flex flex-col gap-2 border-t border-night-line pt-3">
        <span className="ms-mono text-[10px] leading-[13px] text-on-night-subtle">Stock · une barre par référence</span>
        <StockBarcode items={EXAMPLE_BARCODE.slice(0, 28)} height={40} label="Exemple : code-barres du stock" />
        <div className="flex gap-3">
          <LegendKey color="var(--danger-on-night)" label="Rupture" />
          <LegendKey color="var(--amber)" label="Faible" />
        </div>
      </div>
    </figure>
  );
}
