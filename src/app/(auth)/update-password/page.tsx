import type { Metadata } from "next";
import { UpdatePasswordForm } from "@/features/auth/components";
import { AuthShell } from "@/components/auth-shell/auth-shell";
import { Accent } from "@/components/marketing/serif-accent";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default function UpdatePasswordPage() {
  return (
    <AuthShell
      eyebrow="Mot de passe"
      title={
        <>
          Nouveau <Accent className="text-mint">mot de passe.</Accent>
        </>
      }
      lead="Au moins 8 caractères. Il servira aussi sur l'app iPhone."
    >
      <UpdatePasswordForm />
    </AuthShell>
  );
}
