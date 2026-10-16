import { Alert, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "~/auth/session-provider";
import { signOut } from "~/auth/auth-service";
import { useActiveOrg } from "~/org/org-provider";
import { ROLE_LABEL } from "~/org/org-service";
import { appConfig } from "~/lib/config";
import { BRANDS } from "~/brands/registry";
import { useState } from "react";
import { Check, History, KeyRound, Library, Plug, Stethoscope, Volume2 } from "lucide-react-native";
import { playVoiceSample, stopSpeaking } from "~/lib/tts";
import { useVoicePreference, VOICE_CHOICES, type VoiceId } from "~/lib/voice-pref";
import { ActionRow, Avatar, BrandDisclaimer, BrandMark, Button, Card, DetailHeader, ListRow, Screen, SectionHeader, StatusChip, Txt, initialsOf, useToast } from "~/components/ui";
import { color, space } from "~/theme/tokens";

/** Compte, organisation active (changement par appareil), intégrations, déconnexion. */
export default function SettingsScreen() {
  const user = useUser();
  const { active, memberships, setActive, permissions } = useActiveOrg();
  const queryClient = useQueryClient();
  const toast = useToast();
  const host = appConfig.ok ? new URL(appConfig.config.supabaseUrl).host : "—";
  const fullName = (user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? null;

  function confirmSignOut() {
    Alert.alert("Se déconnecter ?", "La session sera retirée de cet appareil.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Se déconnecter",
        style: "destructive",
        onPress: async () => {
          await signOut();
          queryClient.clear();
        },
      },
    ]);
  }

  return (
    <Screen>
      <DetailHeader parentLabel="Aujourd'hui" title="Compte et réglages" />
      <Card padded style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
        <Avatar initials={initialsOf(fullName ?? user?.email)} size={52} />
        <View style={{ flex: 1 }}>
          <Txt variant="title2" numberOfLines={1}>
            {fullName ?? "Mon compte"}
          </Txt>
          <Txt variant="label" numberOfLines={2}>
            {user?.email ?? "—"} · {user?.email_confirmed_at ? "email confirmé" : "email non confirmé"}
          </Txt>
          <Txt variant="label" color={color.ink}>
            {active.organization.name} · {ROLE_LABEL[active.role]}
          </Txt>
        </View>
      </Card>

      <SectionHeader title="Organisation" />
      <Card>
        {memberships.map((m, i) => {
          const selected = m.organization.id === active.organization.id;
          return (
            <ListRow
              key={m.organization.id}
              title={m.organization.name}
              subtitle={`${ROLE_LABEL[m.role]} · ${m.organization.currency}${m.organization.isDemo ? " · démo" : ""}`}
              right={selected ? <StatusChip label="Active" tone="dark" /> : undefined}
              onPress={
                selected
                  ? undefined
                  : () =>
                      void setActive(m.organization.id).then(() => toast({ text: `Organisation active : ${m.organization.name}` }))
              }
              last={i === memberships.length - 1}
            />
          );
        })}
      </Card>
      {!permissions.canWrite ? <Txt variant="label">Rôle lecture seule : consultation uniquement.</Txt> : null}

      <SectionHeader title="Intégrations" />
      <Card>
        <ListRow left={<BrandMark brand={BRANDS.ebay} withName={false} />} title="eBay" subtitle="Connexion du compte vendeur, synchronisation, erreurs" chevron onPress={() => router.push("/ebay")} testID="settings-ebay" />
        <ActionRow icon={KeyRound} title="Comptes fournisseurs" detail="API, flux ou export de vos comptes pro" onPress={() => router.push("/pro-accounts")} />
        <ActionRow icon={Plug} title="Mes sources" detail="Statut, âge des données, synchronisation" onPress={() => router.push("/sourcing-connections")} />
        <ActionRow icon={Library} title="Bibliothèque fournisseurs" detail="Fiches, accès, demandes d'ouverture de compte" onPress={() => router.push("/supplier-directory")} />
        <ActionRow icon={History} title="Imports de catalogues" detail="Historique et rapports d'erreurs" onPress={() => router.push("/sourcing-imports")} />
        <ActionRow icon={Stethoscope} title="Diagnostic" detail="Base, serveur, sourcing, eBay, assistant IA" onPress={() => router.push("/diagnostics")} last />
      </Card>
      <Txt variant="label">Amazon, Shopify et WooCommerce : disponibles prochainement (non connectables pour l'instant).</Txt>
      <BrandDisclaimer />

      <SectionHeader title="Voix du conseiller" />
      <VoiceChooser organizationId={active.organization.id} />

      <SectionHeader title="Application" />
      <Card padded>
        <Txt variant="label">
          Version {Constants.expoConfig?.version ?? "—"} · environnement {appConfig.ok ? appConfig.config.appEnv : "—"} · {host}
        </Txt>
        <Txt variant="label">Vos données sont protégées par les règles d'accès de la base (RLS) : seules vos organisations sont lisibles.</Txt>
      </Card>

      <Button label="Se déconnecter" variant="secondary" onPress={confirmSignOut} />
    </Screen>
  );
}

/**
 * Comparaison à l'oreille des voix OpenAI (même texte représentatif de MON STOCK) et choix de la
 * voix de lecture des réponses. Chaque échantillon n'est synthétisé qu'une fois (cache local).
 */
function VoiceChooser({ organizationId }: { organizationId: string }) {
  const [voice, setVoice] = useVoicePreference();
  const [playing, setPlaying] = useState<VoiceId | null>(null);
  const toast = useToast();
  const listen = (v: VoiceId) => {
    if (playing === v) {
      void stopSpeaking();
      setPlaying(null);
      return;
    }
    setPlaying(v);
    void playVoiceSample(v, organizationId, {
      onDone: () => setPlaying(null),
      onStopped: () => setPlaying(null),
      onError: (m) => {
        setPlaying(null);
        toast({ text: m, tone: "error" });
      },
    });
  };
  return (
    <Card>
      {VOICE_CHOICES.map((c, i) => (
        <ListRow
          key={c.id}
          testID={`voice-${c.id}`}
          title={c.label}
          subtitle={voice === c.id ? "Voix utilisée pour lire les réponses" : "Toucher pour choisir cette voix"}
          left={voice === c.id ? <Check size={18} color={color.success} strokeWidth={2.6} /> : <View style={{ width: 18 }} />}
          right={<Button label={playing === c.id ? "Arrêter" : "Écouter"} compact variant="secondary" icon={<Volume2 size={16} color={color.ink} />} onPress={() => listen(c.id)} testID={`voice-listen-${c.id}`} />}
          onPress={() => setVoice(c.id)}
          last={i === VOICE_CHOICES.length - 1}
        />
      ))}
      <View style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}>
        <Txt variant="label">Même texte d'exemple pour les deux voix (voix de synthèse OpenAI, générée par le serveur ; compte dans le quota IA). Si la voix du serveur est indisponible, la voix de l'appareil prend le relais.</Txt>
      </View>
    </Card>
  );
}
