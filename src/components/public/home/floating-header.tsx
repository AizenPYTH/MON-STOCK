import Link from "next/link";
import { Wordmark } from "@/components/public/wordmark";
import { HOME_NAV } from "@/components/public/home/nav-links";
import { MobileMenu } from "@/components/public/home/mobile-menu";

/**
 * En-tête flottant de l'accueil (handoff v2 §C.1) : pilule nuit #101C2C, bordure
 * rgba(247,248,250,.12), 58 px, rayon 16, à 12 px du haut, hors flux (sticky, hauteur 0).
 * Navigation centrée ≥ 1100 px ; en dessous, bouton 44 px → feuille (composant client).
 */
export function FloatingHeader() {
  return (
    <div data-theme="light" className="sticky top-3 z-50 h-0 bg-transparent">
      <div className="mx-auto w-full max-w-[1352px] px-3 min-[760px]:px-4">
        <header className="relative flex h-[58px] items-center gap-3 rounded-2xl border border-on-night/12 bg-night pl-4 pr-2 text-on-night shadow-[0_18px_40px_-24px_rgba(0,0,0,.65)] min-[760px]:pl-5">
          {/* prefetch={false} : `/` redirige un visiteur connecté. */}
          <Link href="/" prefetch={false} aria-label="MON STOCK — accueil" className="flex min-h-11 items-center rounded-md">
            <Wordmark />
          </Link>
          <nav aria-label="Sections de l'accueil" className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 min-[1100px]:flex">
            {HOME_NAV.map((l) => (
              <a key={l.href} href={l.href} className="rounded-[10px] px-3 py-2 text-[14px] font-semibold text-on-night-muted transition-colors hover:text-on-night">
                {l.label}
              </a>
            ))}
          </nav>
          <nav aria-label="Compte" className="ml-auto flex items-center gap-1.5">
            <Link href="/login" prefetch={false} className="hidden h-11 items-center rounded-[12px] px-3.5 text-[14px] font-bold text-on-night transition-colors hover:bg-night-raised min-[480px]:inline-flex">
              Se connecter
            </Link>
            <Link href="/signup" prefetch={false} className="hidden h-11 items-center rounded-[12px] bg-mint px-4 text-[14px] font-extrabold text-night transition-colors hover:bg-mint-pressed min-[760px]:inline-flex">
              Créer un compte
            </Link>
            <MobileMenu />
          </nav>
        </header>
      </div>
    </div>
  );
}
