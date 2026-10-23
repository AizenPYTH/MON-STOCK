import type { ReactNode } from "react";

// Application entièrement authentifiée : rendu dynamique à chaque requête.
export const dynamic = "force-dynamic";
import Link from "next/link";
import { KeyRound, LockKeyhole, Smartphone, SquareDashed } from "lucide-react";
import { PublicHeader } from "@/components/public/public-chrome";
import { publicEnvIssues } from "@/lib/env";
import { ConfigMissing } from "@/components/layout/config-missing";

/** Garanties RÉELLES du service (aucune statistique, aucun témoignage), rappelées à côté du formulaire. */
const ASSURANCES = [
  { icon: Smartphone, title: "Un seul compte", text: "Le même identifiant sur le web et sur l'application iPhone, avec les mêmes données." },
  { icon: KeyRound, title: "eBay par autorisation officielle", text: "La connexion passe par la page d'eBay (OAuth) : votre mot de passe eBay n'est jamais demandé ni stocké." },
  { icon: LockKeyhole, title: "Identifiants protégés", text: "Les accès fournisseurs sont chiffrés côté serveur et ne sont jamais renvoyés à l'application." },
  { icon: SquareDashed, title: "Des chiffres honnêtes", text: "« ≈ » pour une estimation, « — » pour une valeur inconnue : jamais un 0 inventé." },
] as const;

/**
 * Connexion, inscription et mot de passe : en-tête nuit du site public puis papier arrondi qui
 * porte le formulaire (420 px). Sur grand écran, une colonne rappelle ce que le service garantit.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  // Site déployé sans sa configuration : dire quoi faire plutôt qu'une erreur serveur masquée.
  const missing = publicEnvIssues();
  return (
    <div className="flex min-h-full flex-1 flex-col bg-night">
      <PublicHeader />
      <main id="contenu" className="mt-6 flex flex-1 justify-center rounded-t-3xl bg-background px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        {missing.length > 0 ? (
          <div className="w-full max-w-[420px]">
            <ConfigMissing names={missing} />
          </div>
        ) : (
          <div className="grid w-full max-w-[1040px] items-start gap-12 lg:grid-cols-[420px_minmax(0,440px)] lg:justify-between">
            <div className="mx-auto w-full max-w-[420px] lg:mx-0">{children}</div>
            <aside aria-labelledby="assurances-titre" className="hidden flex-col gap-5 pt-[88px] lg:flex">
              <h2 id="assurances-titre" className="ms-mono text-[11px] leading-[14px] tracking-[0.07em] text-muted">
                Ce que MON STOCK garantit
              </h2>
              <ul className="flex flex-col gap-5">
                {ASSURANCES.map(({ icon: Icon, title, text }) => (
                  <li key={title} className="flex gap-3.5">
                    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface text-foreground">
                      <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-bold leading-5 text-foreground">{title}</span>
                      <span className="mt-0.5 block text-sm font-medium leading-5 text-muted">{text}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="border-t border-border pt-4 text-[13px] font-semibold text-ink-3">
                Service en phase de test.{" "}
                <Link href="/confidentialite" prefetch={false} className="text-interactive underline-offset-4 hover:underline">
                  Politique de confidentialité
                </Link>
              </p>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
