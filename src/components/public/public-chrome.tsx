import Link from "next/link";
import { Wordmark } from "@/components/public/wordmark";

const LEGAL_LINKS = [
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/conditions", label: "Conditions d'utilisation" },
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/support", label: "Support" },
] as const;

export function PublicHeader() {
  return (
    <header className="bg-night text-on-night">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="MON STOCK — accueil" className="rounded-md focus-visible:outline-mint">
          <Wordmark />
        </Link>
        <nav aria-label="Compte" className="flex items-center gap-1 whitespace-nowrap text-[13px] font-semibold sm:gap-2 sm:text-sm">
          <Link href="/login" className="rounded-lg px-2 py-2 text-on-night-muted hover:text-on-night sm:px-3">
            Se connecter
          </Link>
          <Link href="/signup" className="hidden rounded-lg bg-mint px-3.5 py-2 text-night hover:bg-mint-pressed sm:inline-block">
            Créer un compte
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Wordmark tone="light" />
        <nav aria-label="Informations légales">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-foreground">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
