import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/components";
import { loginErrorMessage } from "@/features/auth/messages";
import { AuthShell, ShellHeaderLink } from "@/components/auth-shell/auth-shell";
import { Accent } from "@/components/marketing/serif-accent";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  // `error` est un code : seul un message connu est affiché.
  return (
    <AuthShell
      ports
      eyebrow="Connexion · Espace vendeur"
      headerAction={<ShellHeaderLink href="/signup">Créer un compte</ShellHeaderLink>}
      title={
        <>
          Retrouvez <Accent className="text-mint">votre stock.</Accent>
        </>
      }
      lead="Stock, ventes eBay et fournisseurs, là où vous les avez laissés."
    >
      <LoginForm next={next} initialError={loginErrorMessage(error)} />
    </AuthShell>
  );
}
