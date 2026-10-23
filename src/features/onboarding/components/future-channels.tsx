import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChannelStatus } from "@/components/marketing/channel-status";
import { parcoursMotion as motion } from "@/components/auth-shell/motion";
import { FUTURE_CHANNELS, type FutureChannelKey } from "@/features/onboarding/platform-state";

/**
 * « AUTRES PLATEFORMES · PAS ENCORE DISPONIBLES » (handoff v2 §D) : cartes en pointillés, badge
 * PROCHAINEMENT, jamais de bouton de connexion ni de date. Une carte n'est qu'un lien de lecture
 * (`?canal=`) qui ouvre le panneau explicatif : aucun appel, aucune liste d'attente, rien d'enregistré.
 */
export function FutureChannels({ selected }: { selected: FutureChannelKey | null }) {
  const chosen = FUTURE_CHANNELS.find((c) => c.key === selected) ?? null;
  return (
    <section aria-labelledby="autres-titre" className="flex flex-col gap-4">
      <h2 id="autres-titre" className="ms-mono text-[10.5px] leading-[14px] tracking-[0.08em] text-ink-3">
        Autres plateformes · pas encore disponibles
      </h2>
      <ul className="grid gap-3 sm:grid-cols-3">
        {FUTURE_CHANNELS.map((c) => {
          const active = c.key === selected;
          return (
            <li key={c.key}>
              <Link
                href={`/onboarding/plateforme?canal=${c.key}#canal-futur`}
                scroll={false}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex h-full min-h-[132px] flex-col gap-2.5 rounded-[18px] border-[1.5px] border-dashed p-4 transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active ? "border-foreground/60 bg-surface" : "border-paper-marketing-rule-strong bg-transparent hover:bg-surface/60",
                )}
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[18px] font-extrabold tracking-[-0.02em] text-foreground">{c.label}</span>
                  <ChannelStatus state="soon" surface="paper" size="sm" />
                </span>
                <span className="text-[13px] font-medium leading-[18px] text-muted">{c.text}</span>
                <span className="mt-auto text-[13px] font-bold text-interactive underline-offset-4">{active ? "Panneau ouvert ci-dessous" : "Pourquoi pas encore ?"}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {chosen ? (
        <div id="canal-futur" role="region" aria-labelledby="canal-futur-titre" className={cn(motion.arrive, "flex flex-col gap-3 rounded-[22px] bg-night p-6 text-on-night sm:p-7")}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h3 id="canal-futur-titre" className="text-[22px] font-extrabold leading-7 tracking-[-0.02em]">
                {chosen.label} n&apos;est pas encore disponible
              </h3>
              <ChannelStatus state="soon" />
            </div>
            <Link href="/onboarding/plateforme" scroll={false} aria-label="Fermer le panneau" className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-on-night-muted hover:bg-night-raised hover:text-on-night">
              <X aria-hidden="true" className="h-5 w-5" />
            </Link>
          </div>
          <p className="max-w-[640px] text-[15px] font-medium leading-[23px] text-on-night-muted">
            Aucune connexion {chosen.label} n&apos;est possible aujourd&apos;hui et aucune date n&apos;est annoncée. Il n&apos;y a pas de liste d&apos;attente : consulter ce panneau n&apos;enregistre rien.
          </p>
          <p className="max-w-[640px] text-[15px] font-medium leading-[23px] text-on-night-muted">
            Vos produits, vos SKU et vos quantités ne dépendent d&apos;aucun canal : ils restent dans votre stock central. En attendant, connectez eBay ou continuez sans plateforme.
          </p>
        </div>
      ) : null}
    </section>
  );
}
