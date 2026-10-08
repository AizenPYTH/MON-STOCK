import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page introuvable" };

/** 404 globale (routes inexistantes) : rendue dans le layout racine, sans la navigation de l'application. */
export default function NotFound() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="px-6 py-5">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          MON STOCK
        </Link>
      </header>
      <main id="contenu" className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md text-center">
          <p className="text-sm font-semibold text-muted tnum">Erreur 404</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Page introuvable</h1>
          <p className="mt-2 text-sm text-muted">L'adresse demandée n'existe pas ou a été déplacée. Vérifiez le lien ou revenez à votre tableau de bord.</p>
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
