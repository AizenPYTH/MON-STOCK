import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/public/wordmark";
import { BarcodeField } from "@/components/marketing/barcode-field";
import { PortsPanel } from "@/components/auth-shell/ports-panel";
import motion from "@/components/auth-shell/parcours.module.css";

/**
 * Cadre commun du parcours (handoff v2 §D, §E `AuthShell`) : scène nuit (mot-symbole, étape,
 * sur-titre, titre à accent serif 64/40, lead, champ de 90 barres en pied — 96 px, 70 en mobile) puis
 * papier chaud `#F3F2EE` (rayon 28) qui remonte de 28 px sur le champ.
 * - `ports` : panneau « PORTS DU STOCK CENTRAL » à gauche du formulaire (≥ 1100 px seulement) ;
 * - `width` : `form` (≤ 460, centré) ou `wide` (≤ 880 : choix de plateforme).
 * Palette marketing FIXE (même scène que l'accueil) : le cadre impose le thème clair à son contenu
 * (`data-theme="light"`), quel que soit le thème de l'application.
 * Composant serveur ; seules les animations CSS (transform / opacity) bougent.
 */
export function AuthShell({
  eyebrow,
  title,
  lead,
  step,
  headerAction,
  ports = false,
  width = "form",
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  /** Étape du parcours, en mono à droite de l'en-tête (ex. « ÉTAPE 3 SUR 3 »). */
  step?: string;
  headerAction?: ReactNode;
  ports?: boolean;
  width?: "form" | "wide";
  children: ReactNode;
}) {
  return (
    <div data-theme="light" className="flex min-h-full flex-1 flex-col bg-night text-on-night">
      <header className="mx-auto flex h-[68px] w-full max-w-[1240px] items-center justify-between gap-4 px-[18px] sm:px-8 xl:px-14">
        {/* prefetch={false} (W-01) : pour un utilisateur connecté, `/` redirige selon l'état du compte. */}
        <Link href="/" prefetch={false} aria-label="MON STOCK — accueil" className="flex min-h-11 items-center rounded-md">
          <Wordmark />
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          {step ? <span className="ms-mono hidden truncate text-[10.5px] leading-[14px] tracking-[0.08em] text-on-night-subtle sm:inline">{step}</span> : null}
          {headerAction}
        </div>
      </header>

      <section aria-labelledby="parcours-titre" className="relative overflow-hidden">
        <div className={cn(motion.arrive, "mx-auto w-full max-w-[1240px] px-[18px] pb-10 pt-6 sm:px-8 sm:pt-10 xl:px-14")}>
          <p className="ms-mono text-[11px] leading-[14px] tracking-[0.08em] text-on-night-muted">
            {step ? <span className="sm:hidden">{step} · </span> : null}
            {eyebrow}
          </p>
          <h1 id="parcours-titre" className="mt-3 max-w-[900px] text-[40px] font-extrabold leading-[1] tracking-[-0.045em] text-on-night min-[760px]:text-[64px] min-[760px]:leading-[0.98]">
            {title}
          </h1>
          {lead ? <p className="mt-4 max-w-[560px] text-[17px] font-medium leading-[25px] text-on-night-muted min-[760px]:text-[19px] min-[760px]:leading-7">{lead}</p> : null}
        </div>
        <BarcodeField n={90} seed={1107} litRange={[54, 58]} amber={[21, 77]} height={96} mobileHeight={70} growMs={700} growDelayMs={150} growStepMs={12} className="opacity-90" />
      </section>

      <main id="contenu" className="relative z-10 -mt-7 flex flex-1 flex-col rounded-t-[28px] bg-paper-marketing text-foreground">
        <div className={cn("mx-auto w-full px-[18px] pb-20 pt-9 sm:px-8 sm:pt-12 xl:px-14", width === "wide" ? "max-w-[944px]" : ports ? "max-w-[1240px]" : "max-w-[524px] xl:max-w-[572px]")}>
          {ports ? (
            <div className="grid items-start gap-12 min-[1100px]:grid-cols-[minmax(0,1fr)_460px] min-[1100px]:gap-14">
              <div className="hidden min-[1100px]:block">
                <PortsPanel />
              </div>
              <div className="mx-auto w-full max-w-[460px] min-[1100px]:mx-0">{children}</div>
            </div>
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  );
}

/** Lien discret de l'en-tête de la scène (ex. « Se connecter »), cible ≥ 44 px. */
export function ShellHeaderLink({ href, children }: { href: "/login" | "/signup" | "/dashboard"; children: ReactNode }) {
  return (
    <Link href={href} prefetch={false} className="inline-flex min-h-11 items-center rounded-[12px] px-3.5 text-sm font-bold text-on-night hover:bg-night-raised">
      {children}
    </Link>
  );
}
