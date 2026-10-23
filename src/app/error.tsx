"use client";
import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Wordmark } from "@/components/public/wordmark";

/** Erreur hors de l'espace applicatif (connexion, inscription, invitation, onboarding). */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[UI] erreur de page", error.digest ?? "", error.message);
  }, [error]);
  const masked = process.env.NODE_ENV === "production" && Boolean(error.digest);
  const message = masked ? "Une erreur inattendue s'est produite côté serveur. Réessayez dans un instant." : error.message || "Une erreur inattendue s'est produite.";
  return (
    <div className="flex min-h-full flex-1 flex-col bg-night">
      <header className="mx-auto flex h-[68px] w-full max-w-[1440px] items-center px-4 sm:px-6 lg:px-12">
        <Link href="/" prefetch={false} aria-label="MON STOCK — accueil" className="flex min-h-10 items-center rounded-md">
          <Wordmark />
        </Link>
      </header>
      <main id="contenu" className="mt-6 flex flex-1 items-start justify-center rounded-t-3xl bg-background px-4 pb-16 pt-16 sm:pt-24">
        <div role="alert" className="ms-fade w-full max-w-md rounded-3xl border border-danger-line bg-surface p-6 sm:p-7">
          <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger-soft text-danger-ink">
            <TriangleAlert className="h-5 w-5" />
          </span>
          <h1 className="mt-4 text-h2 text-foreground">Impossible d&apos;afficher cette page</h1>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm font-medium text-muted-strong">{message}</p>
          <p className="mt-2 text-sm text-muted">
            Réessayez dans un instant. Si l&apos;erreur persiste, écrivez au{" "}
            <Link href="/support" prefetch={false} className="font-semibold text-interactive underline-offset-4 hover:underline">
              support
            </Link>
            {error.digest ? " en indiquant la référence ci-dessous." : "."}
          </p>
          {error.digest ? <p className="ms-code mt-3 break-all rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted-strong">Référence : {error.digest}</p> : null}
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line-soft pt-4">
            <Button variant="secondary" onClick={() => reset()}>
              <RotateCw aria-hidden="true" className="h-4 w-4" />
              Réessayer
            </Button>
            <ButtonLink href="/login" variant="ghost">
              Connexion
            </ButtonLink>
          </div>
        </div>
      </main>
    </div>
  );
}
