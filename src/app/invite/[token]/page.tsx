import type { Metadata } from "next";

// Application entièrement authentifiée : rendu dynamique à chaque requête.
export const dynamic = "force-dynamic";
import Link from "next/link";
import { getCurrentUser } from "@/features/auth/dal";
import { acceptInvitationAction } from "@/features/organizations/actions";
import { AuthCard, AuthFrame, AuthSubmit } from "@/features/auth/components";
import { PublicHeader } from "@/components/public/public-chrome";
import { inviteErrorMessage } from "@/features/organizations/feedback";

export const metadata: Metadata = { title: "Invitation" };

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const user = await getCurrentUser();
  const back = encodeURIComponent(`/invite/${encodeURIComponent(token)}`);
  return (
    <div className="flex min-h-full flex-1 flex-col bg-night">
      <PublicHeader />
      <main id="contenu" className="mt-6 flex flex-1 justify-center rounded-t-3xl bg-background px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        <div className="w-full max-w-[420px]">
          {/* `error` est un code (jamais un texte libre affiché tel quel : pas d'injection de contenu par lien forgé). */}
          <AuthFrame eyebrow="Invitation" title="Rejoindre une organisation" subtitle="Vous avez été invité à rejoindre une organisation sur MON STOCK." error={inviteErrorMessage(error)}>
            <AuthCard>
              {user ? (
                <form action={acceptInvitationAction} className="flex flex-col gap-2.5">
                  <input type="hidden" name="token" value={token} />
                  <AuthSubmit pendingText="Vérification…">Accepter l&apos;invitation</AuthSubmit>
                  <p className="text-[12.5px] font-semibold text-ink-3">
                    Connecté en tant que <span className="text-foreground">{user.email}</span>. L&apos;invitation doit correspondre à cette adresse.
                  </p>
                </form>
              ) : (
                <>
                  {/* prefetch={false} (W-01) : /login et /signup dépendent de l'état du compte. */}
                  <Link href={`/login?next=${back}` as never} prefetch={false} className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-mint px-5 text-base font-extrabold text-night transition-colors hover:bg-mint-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    Se connecter pour accepter
                  </Link>
                  <Link href={`/signup?next=${back}` as never} prefetch={false} className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl border border-border-strong bg-surface px-5 text-base font-extrabold text-foreground transition-colors hover:bg-line-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    Créer un compte
                  </Link>
                  <p className="text-center text-[12.5px] font-semibold text-ink-3">L&apos;invitation est liée à l&apos;adresse e-mail à laquelle elle a été créée.</p>
                </>
              )}
            </AuthCard>
          </AuthFrame>
        </div>
      </main>
    </div>
  );
}
