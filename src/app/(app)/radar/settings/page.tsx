import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext, isAdmin } from "@/features/auth/dal";
import { PageHeader, Callout } from "@/components/ui/page";
import { buildRadar } from "@/services/radar/radar";
import { RadarSettingsForm } from "@/features/radar/components/settings-form";

export const metadata: Metadata = { title: "Paramètres de coûts" };

/**
 * Paramètres de coûts du radar et des marges de la recherche fournisseurs (administrateur).
 * Un champ vide signifie « inconnu » : le coût n'est jamais compté pour 0, il est signalé comme
 * manquant dans chaque calcul.
 */
export default async function RadarSettingsPage() {
  const ctx = await requireOrgContext();
  const radar = await buildRadar(ctx);
  const readOnly = !isAdmin(ctx.role);
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/radar" className="hover:text-foreground">
            Radar d&apos;achat
          </Link>
        }
        title="Paramètres de coûts"
        description="Utilisés par le radar d'achat et par les marges estimées de la recherche fournisseurs. Champ vide = coût inconnu : il reste signalé comme manquant, jamais compté pour 0."
      />
      <div className="max-w-4xl space-y-4">
        {readOnly ? <Callout tone="neutral">Lecture seule : seul un administrateur peut modifier les paramètres de coûts.</Callout> : null}
        {radar.settingsFromChannel.length > 0 ? <Callout tone="info">Repris de votre canal de vente faute de réglage : {radar.settingsFromChannel.join(", ")}. Enregistrez une valeur pour la fixer.</Callout> : null}
        {radar.missingSettings.length > 0 ? <Callout tone="warning">Encore inconnus : {radar.missingSettings.join(", ")}.</Callout> : null}
        <RadarSettingsForm settings={radar.settings} readOnly={readOnly} />
      </div>
    </>
  );
}
