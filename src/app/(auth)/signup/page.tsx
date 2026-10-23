import type { Metadata } from "next";
import { SignupForm } from "@/features/auth/components";
import { AuthShell, ShellHeaderLink } from "@/components/auth-shell/auth-shell";
import { Accent } from "@/components/marketing/serif-accent";

export const metadata: Metadata = { title: "Créer un compte" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthShell
      ports
      step="Création du compte"
      eyebrow="Inscription"
      headerAction={<ShellHeaderLink href="/login">Se connecter</ShellHeaderLink>}
      title={
        <>
          Un compte. <Accent className="text-mint">Un seul stock.</Accent>
        </>
      }
      lead="Le même identifiant sur le web et sur l'app iPhone. Ensuite : votre organisation, puis votre canal de vente."
    >
      <SignupForm next={next} />
    </AuthShell>
  );
}
