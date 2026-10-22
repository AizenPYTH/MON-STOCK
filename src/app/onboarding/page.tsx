import type { Metadata } from "next";

// Application entièrement authentifiée : rendu dynamique à chaque requête.
export const dynamic = "force-dynamic";
// Le seed DEMO (plusieurs centaines d'insertions) peut dépasser 10 s.
export const maxDuration = 120;
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser, getOrgContext } from "@/features/auth/dal";
import { Wordmark } from "@/components/public/wordmark";
import { OnboardingForm } from "@/features/organizations/components/onboarding-form";

export const metadata: Metadata = { title: "Créer votre organisation" };

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const ctx = await getOrgContext();
  return (
    <div className="flex min-h-full flex-1 flex-col bg-night">
      <header className="mx-auto flex h-[68px] w-full max-w-[1440px] items-center justify-between gap-4 px-4 text-on-night sm:px-6 lg:px-12">
        {/* prefetch={false} (W-01) : pour un utilisateur connecté, `/` redirige vers /dashboard, qui
            redirige vers /onboarding tant qu'il n'a pas d'organisation. Précharger ce lien mettrait en
            cache client une chaîne de redirections dépendante de l'état, rejouée après la création. */}
        <Link href="/" prefetch={false} aria-label="MON STOCK — accueil" className="flex min-h-10 items-center rounded-md">
          <Wordmark />
        </Link>
        {ctx ? (
          <Link href="/dashboard" prefetch={false} className="inline-flex h-10 items-center gap-1 rounded-[10px] px-3 text-sm font-bold text-on-night-muted hover:bg-night-raised hover:text-on-night">
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            Retour à Aujourd&apos;hui
          </Link>
        ) : null}
      </header>
      <main id="contenu" className="mt-6 flex flex-1 justify-center rounded-t-3xl bg-background px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        <div className="w-full max-w-[460px]">
          <OnboardingForm hasOrganization={Boolean(ctx)} />
        </div>
      </main>
    </div>
  );
}
