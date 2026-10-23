import type { Metadata } from "next";
import { ResetPasswordForm } from "@/features/auth/components";
import { AuthShell, ShellHeaderLink } from "@/components/auth-shell/auth-shell";
import { Accent } from "@/components/marketing/serif-accent";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ResetPasswordPage() {
  return (
    <AuthShell
      eyebrow="Mot de passe oublié"
      headerAction={<ShellHeaderLink href="/login">Se connecter</ShellHeaderLink>}
      title={
        <>
          Un lien, <Accent className="text-mint">et c&apos;est reparti.</Accent>
        </>
      }
      lead="Saisissez votre e-mail : un lien pour choisir un nouveau mot de passe vous est envoyé."
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
