import type { Metadata } from "next";

// Application entièrement authentifiée : rendu dynamique à chaque requête.
export const dynamic = "force-dynamic";
// Le seed DEMO (plusieurs centaines d'insertions) peut dépasser 10 s.
export const maxDuration = 120;
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser, getOrgContext } from "@/features/auth/dal";
import { AuthShell } from "@/components/auth-shell/auth-shell";
import { Accent } from "@/components/marketing/serif-accent";
import { ConnectionStepper } from "@/features/onboarding/components/connection-stepper";
import { OnboardingForm } from "@/features/organizations/components/onboarding-form";

export const metadata: Metadata = { title: "Créer votre organisation" };

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const ctx = await getOrgContext();
  return (
    <AuthShell
      step="Étape 2 sur 3 · Organisation"
      eyebrow={ctx ? "Nouvelle organisation" : "Bienvenue"}
      headerAction={
        ctx ? (
          // prefetch={false} (W-01) : pour un utilisateur connecté, `/` redirige vers /dashboard, qui
          // redirige vers /onboarding tant qu'il n'a pas d'organisation. Précharger ce lien mettrait en
          // cache client une chaîne de redirections dépendante de l'état, rejouée après la création.
          <Link href="/dashboard" prefetch={false} className="inline-flex min-h-11 items-center gap-1 rounded-[12px] px-3 text-sm font-bold text-on-night-muted hover:bg-night-raised hover:text-on-night">
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            Retour à Aujourd&apos;hui
          </Link>
        ) : null
      }
      title={
        <>
          Votre stock, <Accent className="text-mint">votre organisation.</Accent>
        </>
      }
      lead="Une organisation regroupe votre stock, vos ventes, vos fournisseurs et vos collaborateurs. Ensuite : votre canal de vente."
    >
      <div className="flex flex-col gap-7">
        <ConnectionStepper
          steps={[
            { label: "Organisation", state: "current" },
            { label: "Plateforme", state: "todo" },
          ]}
        />
        <OnboardingForm hasOrganization={Boolean(ctx)} />
      </div>
    </AuthShell>
  );
}
