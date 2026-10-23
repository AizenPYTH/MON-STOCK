import type { Metadata } from "next";

// Application entièrement authentifiée : rendu dynamique à chaque requête (état de la connexion relu).
export const dynamic = "force-dynamic";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireOrgContext } from "@/features/auth/dal";
import { AuthShell } from "@/components/auth-shell/auth-shell";
import { Accent } from "@/components/marketing/serif-accent";
import { ConnectionStepper } from "@/features/onboarding/components/connection-stepper";
import { ConnectionCard } from "@/features/onboarding/components/connection-card";
import { FutureChannels } from "@/features/onboarding/components/future-channels";
import { getPlatformFacts } from "@/features/onboarding/queries";
import { choosePlatformState } from "@/features/onboarding/platform-state";

export const metadata: Metadata = { title: "Choisir votre plateforme" };

type Search = { connected?: string | string[]; error?: string | string[]; canal?: string | string[] };

/**
 * Étape « plateforme » du parcours (handoff v2 §D, §I). Page serveur sous `proxy.ts` (session
 * exigée), organisation résolue par la DAL (sinon : création d'organisation). L'état affiché vient de
 * la connexion eBay RÉELLE (même source que /settings/integrations) et de l'attente OAuth en base ;
 * `connected` et `error` ne sont que des indices relus contre la base (voir platform-state.ts).
 * « Continuer sans connecter » mène au tableau de bord sans rien mémoriser : la checklist du
 * tableau de bord garde l'étape eBay visible tant qu'elle n'est pas faite.
 */
export default async function PlatformPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requireOrgContext();
  const params = await searchParams;
  const facts = await getPlatformFacts(ctx);
  const state = choosePlatformState({ ...facts, params });
  const done = state.ebay === "success" || state.ebay === "already";

  return (
    <AuthShell
      width="wide"
      step="Configuration · étape 2 sur 2"
      eyebrow={`Canal de vente · ${ctx.organization.name}`}
      title={
        done ? (
          <>
            Votre stock est <Accent className="text-mint">branché.</Accent>
          </>
        ) : (
          <>
            Branchez <Accent className="text-mint">votre premier canal.</Accent>
          </>
        )
      }
      lead="eBay est disponible aujourd'hui. Amazon, Shopify et WooCommerce arriveront ensuite, sur le même stock central."
    >
      <div className="flex flex-col gap-8" data-platform-state={state.kind}>
        <ConnectionStepper
          steps={[
            { label: "Organisation", state: "done" },
            { label: "Plateforme", state: done ? "done" : "current" },
          ]}
        />
        <ConnectionCard state={state} />
        <FutureChannels selected={state.future} />
        {done ? null : (
          <div className="flex flex-col items-start gap-1.5 border-t border-paper-marketing-rule-strong pt-6">
            <Link href="/dashboard" className="group inline-flex min-h-11 items-center gap-2 rounded-[12px] text-[15px] font-extrabold text-foreground underline decoration-paper-marketing-rule-strong decoration-2 underline-offset-[6px] hover:decoration-foreground">
              Continuer sans connecter de plateforme
              <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-300 ease-instrument group-hover:translate-x-0.5" />
            </Link>
            <p className="text-[13px] font-semibold text-ink-3">Vous pourrez connecter eBay plus tard depuis le tableau de bord ou les réglages.</p>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
