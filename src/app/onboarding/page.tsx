import type { Metadata } from "next";

// Application entièrement authentifiée : rendu dynamique à chaque requête.
export const dynamic = "force-dynamic";
// Le seed DEMO (plusieurs centaines d'insertions) peut dépasser 10 s.
export const maxDuration = 120;
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getOrgContext } from "@/features/auth/dal";
import { OnboardingForm } from "@/features/organizations/onboarding-form";

export const metadata: Metadata = { title: "Créer votre organisation" };

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const ctx = await getOrgContext();
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-5">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          MON STOCK
        </Link>
        {ctx ? (
          <Link href="/dashboard" className="text-sm text-muted hover:text-foreground">
            Retour au tableau de bord
          </Link>
        ) : null}
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-8">
        <div className="w-full max-w-lg">
          <OnboardingForm hasOrganization={Boolean(ctx)} />
        </div>
      </main>
    </div>
  );
}
