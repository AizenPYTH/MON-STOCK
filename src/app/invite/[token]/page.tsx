import type { Metadata } from "next";

// Application entièrement authentifiée : rendu dynamique à chaque requête.
export const dynamic = "force-dynamic";
import Link from "next/link";
import { getCurrentUser } from "@/features/auth/dal";
import { acceptInvitationAction } from "@/features/organizations/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormError } from "@/components/ui/form";
import { ButtonLink } from "@/components/ui/button";
import { inviteErrorMessage } from "@/features/organizations/feedback";

export const metadata: Metadata = { title: "Invitation" };

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="px-6 py-5">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          MON STOCK
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight">Rejoindre une organisation</h1>
          <p className="mt-1 text-sm text-muted">Vous avez été invité à rejoindre une organisation sur MON STOCK.</p>
          <div className="mt-5 space-y-3">
            {/* `error` est un code (jamais un texte libre affiché tel quel : pas d'injection de contenu par lien forgé). */}
            <FormError message={inviteErrorMessage(error)} />
            {user ? (
              <form action={acceptInvitationAction}>
                <input type="hidden" name="token" value={token} />
                <SubmitButton className="w-full" pendingText="Vérification…">
                  Accepter l'invitation
                </SubmitButton>
                <p className="mt-2 text-xs text-muted">Connecté en tant que {user.email}. L'invitation doit correspondre à cette adresse.</p>
              </form>
            ) : (
              <>
                <ButtonLink href={`/login?next=${encodeURIComponent(`/invite/${encodeURIComponent(token)}`)}`} className="w-full">
                  Se connecter pour accepter
                </ButtonLink>
                <ButtonLink href={`/signup?next=${encodeURIComponent(`/invite/${encodeURIComponent(token)}`)}`} variant="secondary" className="w-full">
                  Créer un compte
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
