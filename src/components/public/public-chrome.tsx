import Link from "next/link";
import { Wordmark } from "@/components/public/wordmark";

const SITE_LINKS = [
  { href: "/#fonctionnalites", label: "Fonctionnalités" },
  { href: "/#iphone", label: "Sur iPhone" },
  { href: "/#faq", label: "Questions" },
] as const;

const LEGAL_LINKS = [
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/conditions", label: "Conditions d'utilisation" },
  { href: "/support", label: "Support et contact" },
] as const;

/** En-tête nuit du site public et des pages d'authentification (handoff v5, 68 px). */
export function PublicHeader() {
  return (
    <header className="bg-night text-on-night">
      <div className="mx-auto flex h-[68px] w-full max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:gap-7 lg:px-12">
        {/* prefetch={false} (W-01) : pour un visiteur connecté (ex. /invite), `/`, `/login` et `/signup`
            redirigent selon l'état du compte ; ces chaînes ne doivent pas être mises en cache côté client. */}
        <Link href="/" prefetch={false} aria-label="MON STOCK — accueil" className="flex min-h-10 items-center rounded-md">
          <Wordmark />
        </Link>
        <nav aria-label="Site" className="hidden flex-1 items-center gap-[22px] md:flex">
          {SITE_LINKS.map((l) => (
            <Link key={l.href} href={l.href} prefetch={false} className="rounded-md py-2 text-sm font-semibold text-on-night-muted hover:text-on-night">
              {l.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Compte" className="ml-auto flex items-center gap-1.5 whitespace-nowrap md:ml-0">
          <Link href="/login" prefetch={false} className="inline-flex h-10 items-center rounded-[10px] px-3.5 text-sm font-bold text-on-night hover:bg-night-raised">
            Se connecter
          </Link>
          <Link href="/signup" prefetch={false} className="hidden h-10 items-center rounded-[10px] bg-mint px-4 text-sm font-extrabold text-night hover:bg-mint-pressed sm:inline-flex">
            Créer un compte
          </Link>
        </nav>
      </div>
    </header>
  );
}

/** Pied légal (papier, filet haut) : liens vers les pages légales, mention sur les marques citées. */
export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-x-8 gap-y-4 px-4 pb-10 pt-7 sm:px-6 lg:px-12">
        <span className="text-[13px] font-extrabold tracking-[2.4px] text-foreground">MON STOCK</span>
        <nav aria-label="Pages légales" className="flex-1">
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-8 items-center text-[13.5px] font-semibold text-foreground underline underline-offset-2 hover:text-muted">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-[12.5px] font-semibold text-ink-3">© {new Date().getFullYear()} MON STOCK · Marques et logos cités : identification uniquement, aucun partenariat.</p>
      </div>
    </footer>
  );
}
