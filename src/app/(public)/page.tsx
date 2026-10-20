import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, Calculator, FileSpreadsheet, MessageSquareText, Radar, Search, ShoppingCart, Smartphone } from "lucide-react";
import { LEGAL } from "@/content/legal";

export const metadata: Metadata = {
  title: { absolute: "MON STOCK — stock, ventes eBay et sourcing pour revendeurs de téléphones" },
  description: "Suivez votre stock et vos ventes eBay, comparez les prix de vos fournisseurs et repérez les bonnes affaires. Pour les revendeurs de téléphones et de pièces détachées.",
};

const FEATURES = [
  { icon: Boxes, title: "Stock multi-variantes", text: "Modèle, capacité, couleur, grade : chaque référence avec sa quantité, son coût, sa couverture en jours et ses ventes sur 30 jours." },
  { icon: ShoppingCart, title: "Ventes eBay synchronisées", text: "Vos commandes eBay arrivent toutes seules et décrémentent le stock. Chaque mouvement est tracé." },
  { icon: Search, title: "Recherche chez vos fournisseurs", text: "Une recherche, tous vos fournisseurs : prix convertis en euros, stock, âge du prix, du moins cher au plus cher." },
  { icon: Radar, title: "Bonnes affaires et radar des ruptures", text: "Chaque offre est comparée au prix du marché, avec la marge estimée après frais. Les ruptures coûteuses remontent en premier." },
  { icon: FileSpreadsheet, title: "Imports de catalogues", text: "CSV, Excel, XML ou JSON : vous associez les colonnes une fois, les prix fournisseurs se mettent à jour." },
  { icon: Calculator, title: "Outils du revendeur", text: "TVA, marge, prix de vente, frais eBay, devises (taux BCE datés), devis d'expédition et suivi de colis." },
  { icon: MessageSquareText, title: "Conseiller IA", text: "Posez vos questions sur vos ventes et votre stock. Toute action proposée attend votre confirmation." },
  { icon: Smartphone, title: "Sur iPhone et sur ordinateur", text: "Le même compte, les mêmes données : le terrain sur iPhone, le bureau sur le web." },
] as const;

/** Largeurs fixes d'une illustration décorative (pas des données). */
const BARS = [3, 2, 5, 2, 3, 6, 2, 4, 2, 3, 5, 2, 2, 4, 3, 2, 6, 3, 2, 4, 2, 5, 3, 2, 3];
const LEVEL = (i: number) => (i === 6 || i === 16 ? "var(--red)" : i === 3 || i === 11 || i === 20 ? "var(--amber)" : "rgba(247,248,250,0.86)");

export default function HomePage() {
  return (
    <>
      <section className="bg-night text-on-night">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-[1.2fr_1fr] md:items-center md:pb-24 md:pt-20">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-on-night-muted">Revendeurs de téléphones et pièces détachées</p>
            <h1 className="mt-4 text-4xl font-light leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
              Votre stock, vos ventes et vos fournisseurs, <span className="font-extrabold">au même endroit.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-on-night-muted sm:text-lg">
              Sachez ce qui manque, ce qui se vend et où l&apos;acheter moins cher — avec des chiffres honnêtes : estimé quand c&apos;est estimé, inconnu quand c&apos;est inconnu.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-xl bg-mint px-5 py-3 text-sm font-bold text-night hover:bg-mint-pressed">
                Créer un compte
              </Link>
              <Link href="/login" className="rounded-xl border border-night-raised px-5 py-3 text-sm font-bold text-on-night hover:bg-night-raised">
                Se connecter
              </Link>
            </div>
          </div>
          <figure aria-hidden="true" className="rounded-2xl border border-[color:var(--night-line)] bg-night-deep p-6">
            <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.18em] text-on-night-muted">
              <span>Stock</span>
              <span>Illustration</span>
            </div>
            <div className="mt-4 flex h-28 items-stretch gap-[3px]">
              {BARS.map((w, i) => (
                <span key={i} className="rounded-[1px]" style={{ flexGrow: w, background: LEVEL(i) }} />
              ))}
            </div>
            <div className="mt-4 flex gap-5 font-mono text-[11px] uppercase tracking-[0.16em] text-on-night-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px] bg-red" /> Rupture
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px] bg-amber" /> Faible
              </span>
              <span className="ml-auto">Largeur = ventes 30 j</span>
            </div>
          </figure>
        </div>
      </section>

      <section aria-labelledby="fonctions" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="fonctions" className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          Ce que fait MON STOCK
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-2xl border border-border bg-surface p-5">
              <Icon aria-hidden="true" className="h-5 w-5 text-foreground" />
              <h3 className="mt-3 text-base font-bold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="honnete" className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 id="honnete" className="text-2xl font-extrabold tracking-tight">Des chiffres qui disent ce qu&apos;ils savent.</h2>
            <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted">Exemples de notation</p>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-mono text-lg">1 497 €</dt>
              <dd className="mt-1 text-muted">Un chiffre nu est certain : il vient de vos ventes ou de votre stock.</dd>
            </div>
            <div>
              <dt className="font-mono text-lg">
                <span className="text-muted">≈</span> 29 %
              </dt>
              <dd className="mt-1 text-muted">« ≈ » signale une estimation (marge après frais, prix converti).</dd>
            </div>
            <div>
              <dt className="font-mono text-lg">—</dt>
              <dd className="mt-1 text-muted">Inconnu s&apos;affiche « — », jamais 0.</dd>
            </div>
            <div>
              <dt className="font-mono text-lg">prix il y a 2 jours</dt>
              <dd className="mt-1 text-muted">L&apos;âge de chaque prix fournisseur est toujours visible.</dd>
            </div>
          </dl>
        </div>
      </section>

      <section aria-labelledby="iphone" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-col gap-6 rounded-2xl bg-night p-8 text-on-night md:flex-row md:items-center md:justify-between">
          <div>
            <h2 id="iphone" className="text-2xl font-extrabold tracking-tight">
              L&apos;application iPhone
            </h2>
            <p className="mt-2 max-w-xl text-on-night-muted">
              Scanner, ajuster le stock, chercher un prix fournisseur depuis la boutique. Actuellement en test privé (TestFlight), sur invitation.
            </p>
          </div>
          {LEGAL.contactEmail ? (
            <a href={`mailto:${LEGAL.contactEmail}?subject=${encodeURIComponent("Accès à l'application iPhone MON STOCK")}`} className="self-start rounded-xl bg-mint px-5 py-3 text-sm font-bold text-night hover:bg-mint-pressed md:self-auto">
              Demander un accès
            </a>
          ) : null}
        </div>
      </section>
    </>
  );
}
