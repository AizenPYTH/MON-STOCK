import { useState } from "react";
import { Alert, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useQueryClient } from "@tanstack/react-query";
import { Check, FileText, History, KeyRound, LifeBuoy, Library, Plug, Scale, ShieldCheck, Sparkles, Stethoscope, Trash2, Volume2 } from "lucide-react-native";
import { useUser } from "~/auth/session-provider";
import { signOutAndPurge } from "~/auth/sign-out";
import { useActiveOrg } from "~/org/org-provider";
import { ROLE_LABEL } from "~/org/org-service";
import { appConfig } from "~/lib/config";
import { BRANDS } from "~/brands/registry";
import { playVoiceSample, stopSpeaking } from "~/lib/tts";
import { useVoicePreference, VOICE_CHOICES, type VoiceId } from "~/lib/voice-pref";
import { useAiConsent } from "~/lib/ai-consent";
import { LEGAL_PAGES, openLegalPage, type LegalPageKey } from "~/lib/legal";
import { AiConsentSheet } from "~/components/ai-consent";
import { ActionRow, Avatar, BrandDisclaimer, BrandMark, Button, Card, DetailHeader, ListRow, Screen, SectionHeader, StatusChip, Txt, initialsOf, useToast } from "~/components/ui";
import { color, space } from "~/theme/tokens";

const LEGAL_ICON: Record<LegalPageKey, typeof FileText> = { privacy: ShieldCheck, terms: FileText, notice: Scale, support: LifeBuoy };

/**
 * Compte, organisation active (téléphone ET site web), intégrations, accord IA, voix, pages
 * légales, déconnexion avec purge locale, suppression du compte.
 */
export default function SettingsScreen() {
  const user = useUser();
  const { active, memberships, setActive, permissions, profileOrgId } = useActiveOrg();
  const queryClient = useQueryClient();
  const toast = useToast();
  const consent = useAiConsent(user?.id);
  const [consentSheet, setConsentSheet] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const fullName = (user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? null;
  const webOrg = profileOrgId && profileOrgId !== active.organization.id ? memberships.find((m) => m.organization.id === profileOrgId) : undefined;

  async function switchTo(id: string, name: string) {
    setSwitching(id);
    try {
      const r = await setActive(id);
      toast({ text: r.synced ? `Organisation active : ${name} (iPhone et site web)` : `Organisation active sur cet iPhone : ${name}. Le site web n'a pas pu être mis à jour.`, tone: r.synced ? "success" : "error" });
    } finally {
      setSwitching(null);
    }
  }

  function confirmSignOut() {
    Alert.alert("Se déconnecter ?", "La session, le cache et les préférences de ce compte seront effacés de cet appareil.", [
      { text: "Annuler", style: "cancel" },
      { text: "Se déconnecter", style: "destructive", onPress: () => void signOutAndPurge(queryClient, { userId: user?.id }) },
    ]);
  }

  function revokeAi() {
    Alert.alert("Retirer votre accord ?", "Le conseiller, le brouillon de produit par IA et la voix de synthèse seront désactivés sur cet appareil. Vos conversations passées restent consultables.", [
      { text: "Annuler", style: "cancel" },
      { text: "Retirer", style: "destructive", onPress: () => void consent.revoke().then(() => toast({ text: "Accord IA retiré." })) },
    ]);
  }

  return (
    <Screen>
      <DetailHeader parentLabel="Retour" title="Compte et réglages" />
      <Card padded style={{ flexDirection: "row", alignItems: "center", gap: space[3] }} accessibilityLabel={`Compte connecté : ${fullName ?? ""} ${user?.email ?? ""}`}>
        <Avatar initials={initialsOf(fullName ?? user?.email)} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="title2" numberOfLines={1}>
            {fullName ?? "Mon compte"}
          </Txt>
          <Txt variant="bodyRegular" numberOfLines={1} testID="settings-email">
            {user?.email ?? "—"}
          </Txt>
          <Txt variant="label">{user?.email_confirmed_at ? "Adresse confirmée" : "Adresse non confirmée"}</Txt>
        </View>
      </Card>

      <SectionHeader title="Organisation active" count={memberships.length} />
      <Card>
        {memberships.map((m, i) => {
          const selected = m.organization.id === active.organization.id;
          return (
            <ListRow
              key={m.organization.id}
              title={m.organization.name}
              subtitle={`${ROLE_LABEL[m.role]} · ${m.organization.currency}${m.organization.isDemo ? " · démo" : ""}`}
              right={selected ? <StatusChip label="Active" tone="dark" /> : switching === m.organization.id ? <Txt variant="label">…</Txt> : undefined}
              accessibilityState={{ selected }}
              accessibilityLabel={`${m.organization.name}, ${ROLE_LABEL[m.role]}${selected ? ", organisation active" : ", toucher pour l'activer"}`}
              onPress={selected || switching ? undefined : () => void switchTo(m.organization.id, m.organization.name)}
              last={i === memberships.length - 1}
              testID={`settings-org-${m.organization.slug}`}
            />
          );
        })}
      </Card>
      {webOrg ? (
        <Card padded style={{ gap: space[3] }}>
          <Txt variant="bodyRegular">
            Sur le site web, l'organisation active est « {webOrg.organization.name} ». Cet iPhone affiche « {active.organization.name} ».
          </Txt>
          <Button label={`Utiliser « ${active.organization.name} » partout`} variant="secondary" compact onPress={() => void switchTo(active.organization.id, active.organization.name)} />
        </Card>
      ) : (
        <Txt variant="label">Le changement s'applique à cet iPhone et au site web.</Txt>
      )}
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
      <Txt variant="label">Amazon, Shopify et WooCommerce : pas encore connectables.</Txt>
      <BrandDisclaimer />

      <SectionHeader title="Intelligence artificielle" />
      <Card>
        <ListRow
          left={<Sparkles size={20} color={consent.status === "granted" ? color.success : color.ink3} strokeWidth={2} />}
          title="Traitement par OpenAI"
          subtitle={consent.status === "granted" ? "Autorisé : conseiller, brouillon de produit, voix" : "Non autorisé : fonctions IA désactivées"}
          right={<StatusChip label={consent.status === "granted" ? "Autorisé" : "Désactivé"} tone={consent.status === "granted" ? "success" : "neutral"} />}
          onPress={consent.status === "granted" ? revokeAi : () => setConsentSheet(true)}
          accessibilityLabel={consent.status === "granted" ? "Traitement par OpenAI autorisé. Toucher pour retirer votre accord." : "Traitement par OpenAI non autorisé. Toucher pour lire et donner votre accord."}
          last
          testID="settings-ai-consent"
        />
      </Card>

      <SectionHeader title="Voix du conseiller" />
      {consent.status === "granted" ? <VoiceChooser organizationId={active.organization.id} /> : <Txt variant="label">Disponible après votre accord pour l'IA (la voix est générée par OpenAI).</Txt>}

      <SectionHeader title="Aide et informations légales" />
      <Card>
        {LEGAL_PAGES.map((p, i) => (
          <ActionRow key={p.key} icon={LEGAL_ICON[p.key]} title={p.label} onPress={() => void openLegalPage(p.key)} last={i === LEGAL_PAGES.length - 1} testID={`settings-legal-${p.key}`} />
        ))}
      </Card>

      <SectionHeader title="Application" />
      <Card padded style={{ gap: space[1] }}>
        <Txt variant="label">
          Version {Constants.expoConfig?.version ?? "—"} · environnement {appConfig.ok ? appConfig.config.appEnv : "—"}
        </Txt>
        <Txt variant="label">Vos données sont protégées par les règles d'accès de la base : seules vos organisations sont lisibles.</Txt>
      </Card>

      <Button label="Se déconnecter" variant="secondary" onPress={confirmSignOut} testID="settings-sign-out" />
      <Button label="Supprimer mon compte…" variant="ghost" icon={<Trash2 size={18} color={color.dangerInk} strokeWidth={2.2} />} labelColor={color.dangerInk} onPress={() => router.push("/account-delete")} testID="settings-delete-account" />

      <AiConsentSheet
        visible={consentSheet}
        onClose={() => setConsentSheet(false)}
        onAccept={() => {
          setConsentSheet(false);
          void consent.grant().then(() => toast({ text: "Accord IA enregistré sur cet appareil." }));
        }}
      />
    </Screen>
  );
}

/**
 * Comparaison à l'oreille des voix OpenAI (même texte) et choix de la voix de lecture. Le bouton
 * « Écouter » est À CÔTÉ de la ligne de choix (jamais imbriqué : accessible à VoiceOver, M-11).
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
          subtitle={voice === c.id ? "Voix des réponses" : "Toucher pour choisir"}
          left={voice === c.id ? <Check size={18} color={color.success} strokeWidth={2.6} /> : <View style={{ width: 18 }} />}
          accessibilityState={{ selected: voice === c.id }}
          trailing={<Button label={playing === c.id ? "Arrêter" : "Écouter"} compact variant="secondary" icon={<Volume2 size={16} color={color.ink} />} onPress={() => listen(c.id)} accessibilityHint={`Échantillon de la voix ${c.label}`} testID={`voice-listen-${c.id}`} />}
          onPress={() => setVoice(c.id)}
          last={i === VOICE_CHOICES.length - 1}
        />
      ))}
      <View style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}>
        <Txt variant="label">Même texte pour les deux voix, généré par le serveur (compte dans le quota IA). Si la voix du serveur est indisponible, celle de l'iPhone prend le relais.</Txt>
      </View>
    </Card>
  );
}
