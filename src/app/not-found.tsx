import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Wordmark } from "@/components/public/wordmark";

export const metadata: Metadata = { title: "Page introuvable" };

/** 404 globale (routes inexistantes) : rendue dans le layout racine, sans la navigation de l'application. */
export default function NotFound() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-night">
      <header className="mx-auto flex h-[68px] w-full max-w-[1440px] items-center px-4 sm:px-6 lg:px-12">
        <Link href="/" prefetch={false} aria-label="MON STOCK — accueil" className="flex min-h-10 items-center rounded-md">
          <Wordmark />
        </Link>
      </header>
      <main id="contenu" className="mt-6 flex flex-1 items-start justify-center rounded-t-3xl bg-background px-4 pb-16 pt-16 sm:pt-24">
        <div className="ms-fade w-full max-w-md text-center">
          <span aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface text-muted">
            <Compass className="h-6 w-6" strokeWidth={1.8} />
          </span>
          <p className="ms-mono mt-5 text-[11px] leading-[14px] tracking-[0.07em] text-ink-3">Erreur 404</p>
          <h1 className="mt-2 text-[28px] font-extrabold leading-[34px] tracking-[-0.6px] text-foreground">Page introuvable</h1>
          <p className="mt-2 text-[15px] font-medium leading-[22px] text-muted">L&apos;adresse demandée n&apos;existe pas ou a été déplacée. Vérifiez le lien ou revenez à votre tableau de bord.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <ButtonLink href="/dashboard">Tableau de bord</ButtonLink>
            <ButtonLink href="/login" variant="secondary">
              Se connecter
            </ButtonLink>
          </div>
        </div>
      </main>
    </div>
  );
}
