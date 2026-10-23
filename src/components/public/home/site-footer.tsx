import Link from "next/link";
import { Wordmark } from "@/components/public/wordmark";
import { ChannelStatus } from "@/components/marketing/channel-status";

const LEGAL_LINKS = [
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/conditions", label: "Conditions d'utilisation" },
  { href: "/support", label: "Support et contact" },
] as const;

const PRODUCT_LINKS = [
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#produit", label: "Le produit" },
  { href: "#demarrer", label: "Démarrer" },
] as const;

function ColTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-on-night-subtle">{children}</h2>;
}

const linkClass = "inline-flex min-h-10 items-center text-[14.5px] font-semibold text-[#B4BECB] transition-colors hover:text-on-night";

/** Mot-symbole géant rogné (handoff v2 §C.10) : 5 barres + « MON STOCK », voile rgba(247,248,250,.09). */
function GiantWordmark() {
  return (
    <div aria-hidden="true" className="pointer-events-none relative mt-14 h-[13vw] max-h-[190px] min-h-[64px] overflow-hidden min-[760px]:mt-20">
      <div className="absolute inset-x-0 top-0 flex select-none items-start gap-[2.2vw] text-on-night/9">
        <svg viewBox="0 0 18.5 14" className="h-[15vw] max-h-[220px] min-h-[74px] w-auto shrink-0" fill="currentColor" preserveAspectRatio="xMinYMin meet">
          <rect x="0" y="0" width="3" height="14" rx="0.4" />
          <rect x="4.5" y="0" width="1.5" height="14" rx="0.3" />
          <rect x="7.5" y="0" width="4" height="14" rx="0.4" />
          <rect x="13" y="0" width="1.5" height="14" rx="0.3" />
          <rect x="16" y="0" width="2.5" height="14" rx="0.4" />
        </svg>
        <span className="whitespace-nowrap text-[15vw] font-extrabold leading-[0.78] tracking-[-0.04em] min-[1440px]:text-[216px]">MON STOCK</span>
      </div>
    </div>
  );
}

/** Pied de l'accueil (#0C1724) : Produit, Intégrations (statuts réels), Légal, Compte ; mention des marques. */
export function SiteFooter() {
  return (
    <footer data-theme="light" className="overflow-hidden bg-[#0C1724] text-on-night">
      <div className="mx-auto w-full max-w-[1352px] px-[18px] pt-16 min-[760px]:px-8 min-[760px]:pt-20 min-[1100px]:px-14">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 min-[760px]:grid-cols-[1.3fr_1fr_1.25fr_1fr_1fr]">
          <div className="col-span-2 min-[760px]:col-span-1">
            <Link href="/" prefetch={false} aria-label="MON STOCK — accueil" className="inline-flex min-h-10 items-center rounded-md">
              <Wordmark />
            </Link>
            <p className="mt-3 max-w-[280px] text-[14px] font-medium leading-[21px] text-on-night-muted">Un seul stock pour les revendeurs de téléphones et de pièces détachées.</p>
          </div>
          <nav aria-labelledby="pied-produit">
            <ColTitle>
              <span id="pied-produit">Produit</span>
            </ColTitle>
            <ul className="mt-3">
              {PRODUCT_LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className={linkClass}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <ColTitle>Intégrations</ColTitle>
            <ul className="mt-3 flex flex-col gap-2.5">
              <li className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold text-on-night">
                eBay <ChannelStatus state="available" size="sm" />
              </li>
              {["Amazon", "Shopify", "WooCommerce"].map((n) => (
                <li key={n} className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold text-[#B4BECB]">
                  {n} <ChannelStatus state="soon" size="sm" />
                </li>
              ))}
              <li className="text-[13px] font-medium leading-[19px] text-on-night-muted">Devis d&apos;expédition : Sendcloud, Boxtal</li>
            </ul>
          </div>
          <nav aria-labelledby="pied-legal">
            <ColTitle>
              <span id="pied-legal">Légal</span>
            </ColTitle>
            <ul className="mt-3">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} prefetch={false} className={linkClass}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-labelledby="pied-compte">
            <ColTitle>
              <span id="pied-compte">Compte</span>
            </ColTitle>
            <ul className="mt-3">
              <li>
                <Link href="/signup" prefetch={false} className={linkClass}>
                  Créer un compte
                </Link>
              </li>
              <li>
                <Link href="/login" prefetch={false} className={linkClass}>
                  Se connecter
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-on-night/10 pt-6 text-[12.5px] font-medium leading-[19px] text-on-night-subtle min-[760px]:flex-row min-[760px]:justify-between">
          <p>© {new Date().getFullYear()} MON STOCK</p>
          <p className="max-w-[720px]">eBay, Amazon, Shopify, WooCommerce, BigBuy, Ingram Micro, Sendcloud et Boxtal sont des marques de leurs propriétaires respectifs, citées à titre d&apos;identification uniquement : aucun partenariat n&apos;est suggéré.</p>
        </div>
      </div>
      <GiantWordmark />
    </footer>
  );
}
