import type { CSSProperties, ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Accent } from "@/components/marketing/serif-accent";
import { ExampleTag } from "@/components/marketing/example-tag";
import { SALE } from "@/components/public/home/sale-data";

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/**
 * Récit numéroté (handoff v2 §C.6, `Story`) : numéro serif, titre à accent, texte, panneau visuel.
 * Alternance gauche / droite ≥ 1100 px (`side`). Composant serveur ; révélations par data-r / data-g.
 */
function Story({ n, title, text, side, panel }: { n: string; title: ReactNode; text: ReactNode; side: "left" | "right"; panel: ReactNode }) {
  return (
    <article className="grid items-center gap-8 min-[1100px]:grid-cols-2 min-[1100px]:gap-16">
      <div className={cn("max-w-[520px]", side === "right" && "min-[1100px]:order-2 min-[1100px]:justify-self-end")}>
        <span data-r="" aria-hidden="true" className="block font-serif text-[56px] italic leading-none text-night/35 min-[760px]:text-[72px]">
          {n}
        </span>
        <h3 data-r="" style={d(60)} className="mt-3 text-[30px] font-extrabold leading-[1.04] tracking-[-0.04em] text-night min-[760px]:text-[40px]">
          {title}
        </h3>
        <p data-r="" style={d(120)} className="mt-4 text-[16.5px] font-medium leading-[1.6] text-[#5B6676]">
          {text}
        </p>
      </div>
      <div data-r="" style={d(80)} className={cn("min-w-0", side === "right" && "min-[1100px]:order-1")}>
        {panel}
      </div>
    </article>
  );
}

function PanelHead({ label, surface = "paper" }: { label: string; surface?: "night" | "paper" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn("font-mono text-[10px] font-semibold uppercase tracking-[0.08em]", surface === "night" ? "text-on-night-muted" : "text-[#5B6676]")}>{label}</span>
      <ExampleTag surface={surface} />
    </div>
  );
}

/* 01 — panneau nuit : 48 barres + chaîne produit → variante → SKU. */
const BARS = Array.from({ length: 48 }, (_, i) => {
  const out = i === 1 || i === 6 || i === 11;
  const low = i === 3 || i === 9 || i === 15 || i === 22 || i === 30;
  const base = ((i * 37) % 23) / 23;
  return { w: Math.round((base * base * 2.4 + 0.6) * 10) / 10, h: 40 + ((i * 53) % 61), level: out ? "out" : low ? "low" : i === 47 ? "sel" : "ok" };
});

function CatalogPanel() {
  return (
    <div className="rounded-[26px] bg-night p-5 text-on-night min-[760px]:p-8">
      <PanelHead label="Stock · 48 références" surface="night" />
      <div aria-hidden="true" className="mt-6 flex h-[120px] items-end gap-[3px]">
        {BARS.map((b, i) => (
          <span key={i} data-g="" style={{ ...d(i * 14), flex: `${b.w} 1 0`, height: `${b.h}%` }} className={cn("block rounded-t-[1px]", b.level === "out" ? "bg-red" : b.level === "low" ? "bg-amber" : b.level === "sel" ? "bg-mint" : "bg-on-night/30")} />
        ))}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-on-night-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-red" />
          Rupture
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-amber" />
          Stock faible
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-on-night/30" />
          En stock
        </span>
        <span className="text-on-night-subtle">Largeur = ventes 30 j</span>
      </p>
      <ol className="mt-6 grid gap-2 min-[560px]:grid-cols-[1fr_auto_1fr_auto_1fr] min-[560px]:items-center">
        {[
          { k: "Produit", v: "iPhone 13" },
          { k: "Variante", v: "128 Go · Noir · Grade A" },
          { k: "SKU", v: SALE.sku, mono: true },
        ].map((x, i) => (
          <li key={x.k} className="contents">
            {i > 0 ? <span aria-hidden="true" className="mx-auto hidden h-px w-6 bg-mint/60 min-[560px]:block" /> : null}
            <span className={cn("block rounded-[12px] border px-3 py-2.5", i === 2 ? "border-mint/60 bg-mint/8" : "border-on-night/12")}>
              <span className="block font-mono text-[9px] uppercase tracking-[0.08em] text-on-night-subtle">{x.k}</span>
              <span className={cn("mt-0.5 block truncate text-[13.5px] font-bold", x.mono && "font-mono text-[12px] text-mint")}>{x.v}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* 02 — panneau blanc : journal de mouvements (5 lignes décalées de 90 ms). */
const LEDGER = [
  { t: "10:42", what: `Vente eBay ${SALE.order}`, sku: SALE.sku, delta: "−1", after: "1", tone: "out" },
  { t: "09:58", what: "Réception fournisseur", sku: "BAT-IP12", delta: "+12", after: "18", tone: "in" },
  { t: "Hier", what: "Vente en boutique", sku: "CQ-IP15-MS", delta: "−1", after: "9", tone: "out" },
  { t: "Hier", what: "Ajustement · casse", sku: "ECR-IP14-OLED", delta: "−1", after: "0", tone: "out" },
  { t: "Lun.", what: "Inventaire", sku: "IP13-128-NR-A", delta: "+1", after: "2", tone: "in" },
] as const;

function LedgerPanel() {
  return (
    <div className="rounded-[26px] border border-paper-marketing-line bg-white p-5 min-[760px]:p-8">
      <PanelHead label="Journal des mouvements" />
      <ul className="mt-5">
        {LEDGER.map((l, i) => (
          <li key={i} data-r="" style={d(i * 90)} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-t border-paper-marketing-rule py-3 min-[560px]:grid-cols-[52px_minmax(0,1fr)_auto_52px]">
            <span className="font-mono text-[10.5px] text-[#778292]">{l.t}</span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-bold text-night">{l.what}</span>
              <span className="block truncate font-mono text-[10.5px] text-[#778292]">{l.sku}</span>
            </span>
            <span className={cn("rounded-[6px] px-1.5 py-0.5 font-mono text-[12px] font-semibold", l.tone === "in" ? "bg-[#E3F8EE] text-[#1E7F57]" : "bg-[#FBF1E2] text-[#8A5A12]")}>{l.delta}</span>
            <span className="hidden text-right text-[13px] font-semibold text-[#5B6676] min-[560px]:block">
              → <b className="font-extrabold text-night tabular-nums">{l.after}</b>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* 03 — panneau menthe pâle : règle de marché + cascade de marge. */
const pos = (pct: number) => `${((pct + 40) / 60) * 100}%`;
const WATERFALL = [
  { label: "Prix de vente", amount: "109,00 €", from: 0, to: 100, kind: "base" },
  { label: "Commission et frais", amount: "−15,90 €", from: 85.4, to: 100, kind: "minus" },
  { label: "Coût d'achat rendu", amount: "−61,70 €", from: 28.8, to: 85.4, kind: "minus" },
  { label: "Bénéfice estimé", amount: "≈ 31,40 €", from: 0, to: 28.8, kind: "result" },
] as const;

function MarketPanel() {
  return (
    <div className="rounded-[26px] border border-[#BFE3D2] bg-[#DDF3E8] p-5 min-[760px]:p-8">
      <PanelHead label="Écran iPhone 14 OLED · offre fournisseur" />
      <div className="mt-6">
        <div className="relative h-[64px]">
          <div className="absolute inset-x-0 top-[30px] h-[6px] overflow-hidden rounded-full bg-white">
            <span data-gx="" className="block h-full bg-[#1E7F57]/25" style={{ width: pos(-10) }} />
          </div>
          {[-40, -30, -20, -10, 0, 10, 20].map((t) => (
            <span key={t} className={cn("absolute top-[44px] whitespace-nowrap font-mono text-[9.5px] text-[#3E4A5B]", t === -40 ? "" : t === 20 ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: pos(t) }}>
              {t > 0 ? `+${t}` : t === 0 ? "0" : `−${-t}`}&nbsp;%
            </span>
          ))}
          {/* Médiane du marché. */}
          <span className="absolute top-[18px] h-[24px] w-[2px] -translate-x-1/2 bg-night" style={{ left: pos(0) }} />
          <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] font-semibold text-night" style={{ left: pos(0) }}>
            médiane 69,50 €
          </span>
          {/* Offre. */}
          <span className="absolute top-[24px] h-[18px] w-[18px] -translate-x-1/2 rounded-full border-[3px] border-white bg-[#1E7F57]" style={{ left: pos(-15.3) }} />
          <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-[5px] bg-[#1E7F57] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white" style={{ left: pos(-15.3) }}>
            offre 58,90 €
          </span>
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-[#3E4A5B]">−15,3 % sous la médiane (9 offres) · prix vu il y a 3 h</p>
      </div>
      <div className="mt-6 rounded-[16px] bg-white p-4">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5B6676]">Calcul par unité</span>
        <ul className="mt-3 flex flex-col gap-2.5">
          {WATERFALL.map((w, i) => (
            <li key={w.label} className="grid grid-cols-[minmax(0,1fr)_84px] items-center gap-3 min-[560px]:grid-cols-[150px_minmax(0,1fr)_84px]">
              <span className="truncate text-[13px] font-semibold text-[#3E4A5B]">{w.label}</span>
              <span className="relative hidden h-[14px] min-[560px]:block">
                <span data-gx="" style={{ ...d(i * 100), left: `${w.from}%`, width: `${w.to - w.from}%` }} className={cn("absolute inset-y-0 rounded-[3px]", w.kind === "base" ? "bg-night" : w.kind === "minus" ? "bg-[#E5A34D]" : "bg-[#1E7F57]")} />
              </span>
              <span className={cn("text-right text-[13.5px] font-extrabold tabular-nums", w.kind === "result" ? "text-[#1E7F57]" : "text-night")}>{w.amount}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] font-semibold text-[#8A5A12]">Provisoire : frais de port non renseignés.</p>
      </div>
    </div>
  );
}

/* 04 — panneau blanc : assistant d'import, correspondance des colonnes, barre répartie. */
const SPLIT = [
  { label: "Nouvelles", value: 186, cls: "bg-[#1E7F57]" },
  { label: "Mises à jour", value: 1640, cls: "bg-night" },
  { label: "Inchangées", value: 312, cls: "bg-[#D5DBE4]" },
  { label: "Ignorées", value: 21, cls: "bg-[#DC5A5A]" },
] as const;
const int = (n: number) => new Intl.NumberFormat("fr-FR").format(n).replace(/[  ]/g, " ");

function ImportPanel() {
  const total = SPLIT.reduce((a, s) => a + s.value, 0);
  return (
    <div className="rounded-[26px] border border-paper-marketing-line bg-white p-5 min-[760px]:p-8">
      <PanelHead label="Import · catalogue-fournisseur.xlsx" />
      <ol className="mt-5 grid grid-cols-2 gap-2 min-[560px]:grid-cols-4">
        {["Fichier", "Aperçu", "Colonnes", "Confirmation"].map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2 rounded-[10px] border px-2.5 py-2 text-[12.5px] font-bold", i < 2 ? "border-[#BFE3D2] bg-[#E3F8EE] text-[#1E7F57]" : i === 2 ? "border-night text-night" : "border-paper-marketing-line text-[#778292]")}>
            <span aria-hidden="true" className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px]", i < 2 ? "bg-[#1E7F57] text-white" : i === 2 ? "bg-night text-on-night" : "bg-paper-marketing text-[#5B6676]")}>
              {i < 2 ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
      <div className="mt-5 overflow-hidden rounded-[12px] border border-paper-marketing-line">
        <div className="grid grid-cols-2 bg-paper-marketing font-mono text-[9.5px] uppercase tracking-[0.06em] text-[#5B6676]">
          <span className="px-3 py-2">Colonne du fichier</span>
          <span className="px-3 py-2">Champ MON STOCK</span>
        </div>
        {[
          ["Ref_Fournisseur", "Référence fournisseur"],
          ["Prix HT", "Coût d'achat (HT)"],
          ["Qte_dispo", "Disponibilité fournisseur"],
        ].map(([a, b]) => (
          <div key={a} className="grid grid-cols-2 border-t border-paper-marketing-rule text-[13px]">
            <span className="truncate px-3 py-2 font-mono text-[12px] text-[#3E4A5B]">{a}</span>
            <span className="truncate px-3 py-2 font-bold text-night">→ {b}</span>
          </div>
        ))}
      </div>
      <p className="mt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5B6676]">{int(total)} lignes lues · rien n&apos;est enregistré avant confirmation</p>
      <div className="mt-2.5 flex h-3 w-full gap-[3px] overflow-hidden rounded-[6px]" role="img" aria-label={`Exemple : ${SPLIT.map((s) => `${s.label} ${int(s.value)}`).join(", ")}`}>
        {SPLIT.map((s, i) => (
          <span key={s.label} data-gx="" style={{ ...d(i * 90), flexGrow: s.value }} className={cn("block h-full min-w-1", s.cls)} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] font-semibold text-[#5B6676]">
        {SPLIT.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span aria-hidden="true" className={cn("h-[9px] w-[9px] rounded-[2px]", s.cls)} />
            {s.label}
            <b className="ml-auto font-bold tabular-nums text-night">{int(s.value)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TOOLS = ["TVA", "Marge", "Prix de vente", "Remise", "Frais eBay", "Devises · taux BCE datés", "Comparateur de frais de port", "Tarifs d'expédition", "Suivi de colis"];

/** Bandeau défilant des outils (38 s, linéaire ; figé sous « réduire les animations »). */
function ToolsMarquee() {
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {TOOLS.map((t) => (
        <li key={t} className="flex items-center whitespace-nowrap px-6 text-[34px] font-extrabold tracking-[-0.04em] text-night min-[760px]:px-9 min-[760px]:text-[52px]">
          {t}
          <span aria-hidden="true" className="ml-12 font-serif text-[0.8em] font-normal italic text-night/30 min-[760px]:ml-[72px]">
            ·
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="mt-24 border-y border-paper-marketing-line py-6 min-[760px]:mt-32 min-[760px]:py-9">
      <p className="mx-auto mb-4 w-full max-w-[1352px] px-[18px] font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#5B6676] min-[760px]:px-8 min-[1100px]:px-14">Les outils du quotidien, inclus</p>
      <div className="overflow-hidden" aria-label="Outils inclus">
        <div className="mk-loop flex w-max" style={{ animation: "mk-marquee 38s linear infinite" }}>
          {row(false)}
          {row(true)}
        </div>
      </div>
    </div>
  );
}

/** Fonctionnalités (papier chaud) : 4 récits en alternance + bandeau des outils. */
export function Stories() {
  return (
    <section id="fonctionnalites" aria-labelledby="fonctionnalites-titre" className="scroll-mt-20 overflow-hidden bg-paper-marketing pb-20 min-[760px]:pb-36">
      <div className="mx-auto w-full max-w-[1352px] px-[18px] pt-20 min-[760px]:px-8 min-[760px]:pt-36 min-[1100px]:px-14">
        <p data-r="" className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#5B6676]">Fonctionnalités</p>
        <h2 id="fonctionnalites-titre" data-r="" style={d(80)} className="mt-4 max-w-[980px] text-[38px] font-extrabold leading-none tracking-[-0.045em] text-night min-[760px]:text-[56px] min-[1100px]:text-[76px]">
          Le bureau du revendeur, <Accent>sans tableur.</Accent>
        </h2>
        <div className="mt-16 flex flex-col gap-16 min-[760px]:mt-24 min-[1100px]:gap-[120px]">
          <Story n="01" side="left" title={<>Chaque barre est <Accent>une référence.</Accent></>} text="Produits, variantes (capacité, couleur, grade) et SKU. Le code-barres du stock montre d'un coup d'œil ce qui manque : largeur selon les ventes, couleur selon le niveau." panel={<CatalogPanel />} />
          <Story n="02" side="right" title={<>Chaque mouvement <Accent>laisse une trace.</Accent></>} text="Ventes eBay, ventes en boutique, réceptions, ajustements : chaque variation de quantité est datée, expliquée et rattachée à son SKU." panel={<LedgerPanel />} />
          <Story n="03" side="left" title={<>Achetez au bon prix, <Accent>pas au hasard.</Accent></>} text="Une recherche interroge vos comptes fournisseurs, vos catalogues importés et des sources publiques autorisées. Chaque offre est placée face à la médiane du marché, avec l'âge du prix et la marge estimée." panel={<MarketPanel />} />
          <Story n="04" side="right" title={<>Vos catalogues, <Accent>sans ressaisie.</Accent></>} text="CSV, Excel, XML ou JSON : aperçu, correspondance des colonnes mémorisée, rapport ligne par ligne. Rien n'est enregistré avant votre confirmation." panel={<ImportPanel />} />
        </div>
      </div>
      <ToolsMarquee />
    </section>
  );
}
