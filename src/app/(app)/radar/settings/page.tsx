import type { Metadata } from "next";
import { requireOrgContext, isAdmin } from "@/features/auth/dal";
import { Paper, Scene, SceneHeader } from "@/components/instrument";
import { Callout } from "@/components/ui/page";
import { buildRadar } from "@/services/radar/radar";
import { RadarSettingsForm } from "@/features/radar/components/settings-form";

export const metadata: Metadata = { title: "Coûts du radar" };

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
      <Scene>
        <SceneHeader
          back={{ href: "/radar", label: "Radar d'opportunités" }}
          eyebrow="Sourcing · paramètres"
          title="Coûts du radar"
          description="Utilisés par le radar d'opportunités et par les marges estimées de la recherche fournisseurs. Champ vide = coût inconnu : il reste signalé comme manquant, jamais compté pour 0."
        />
      </Scene>
      <Paper>
        <div className="max-w-4xl space-y-4">
          {readOnly ? <Callout tone="neutral">Lecture seule : seul un administrateur peut modifier les paramètres de coûts.</Callout> : null}
          {radar.settingsFromChannel.length > 0 ? <Callout tone="info">Repris de votre canal de vente faute de réglage : {radar.settingsFromChannel.join(", ")}. Enregistrez une valeur pour la fixer.</Callout> : null}
          {radar.missingSettings.length > 0 ? <Callout tone="warning">Encore inconnus : {radar.missingSettings.join(", ")}.</Callout> : null}
          <RadarSettingsForm settings={radar.settings} readOnly={readOnly} />
        </div>
      </Paper>
    </>
  );
}
