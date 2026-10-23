import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Trash2 } from "lucide-react-native";
import { ACCOUNT_DELETE_CONFIRMATION } from "@/features/mobile-api/contract";
import { useSession, useUser } from "~/auth/session-provider";
import { signOutAndPurge } from "~/auth/sign-out";
import { useOrg } from "~/org/org-provider";
import { ROLE_LABEL } from "~/org/org-service";
import { deleteMyAccount } from "~/data/account";
import { userMessage } from "~/lib/errors";
import { openLegalPage } from "~/lib/legal";
import { useOnline } from "~/lib/use-online";
import { AlertBanner, Button, Card, DetailHeader, Screen, SectionHeader, StickyActions, TextField, Txt, useToast } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";

const DELETED = [
  "Votre identifiant de connexion (e-mail, mot de passe) et votre profil.",
  "Chaque organisation dont vous êtes le seul membre, avec tout son contenu : produits, stock et journal des mouvements, ventes et commandes importées, fournisseurs, offres, imports, colis, réglages.",
  "Les connexions eBay et les comptes fournisseurs de ces organisations : jetons et identifiants chiffrés sont effacés.",
  "Vos conversations avec le conseiller IA.",
  "Sur cet iPhone : session, données en cache, préférences.",
];

const KEPT = [
  "Une organisation partagée reste aux autres membres ; vous en êtes simplement retiré. Les mouvements que vous y avez saisis restent dans son journal, sans votre nom.",
  "Si vous êtes le seul propriétaire d'une organisation qui compte d'autres membres, la suppression est refusée : désignez d'abord un autre propriétaire (site web → Réglages → Utilisateurs).",
];

/**
 * Suppression de compte (M-01, App Store 5.1.1(v)) : accessible depuis Réglages ET depuis l'accueil
 * sans organisation (route hors de la garde d'organisation). Confirmation par saisie du mot
 * SUPPRIMER ; rien n'est affiché comme supprimé avant la réponse du serveur ; ensuite
 * déconnexion et purge locale complète (cache TanStack, mutations, trousseau, fichiers).
 */
export default function AccountDeleteScreen() {
  const session = useSession();
  const user = useUser();
  const org = useOrg();
  const queryClient = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session.status === "signedOut" && !busy) return <Redirect href="/login" />;

  const typed = confirmation.trim() === ACCOUNT_DELETE_CONFIRMATION;
  const memberships = org.status === "ready" ? org.memberships : [];

  async function submit() {
    if (!typed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await deleteMyAccount(confirmation);
      await signOutAndPurge(queryClient, { userId: user?.id, forget: true });
      toast({
        text: r.remoteRevocationIncomplete
          ? "Compte supprimé. eBay n'a pas confirmé la révocation : retirez aussi l'accès de MON STOCK depuis votre compte eBay."
          : "Votre compte et ses données ont été supprimés.",
      });
      router.replace("/login");
    } catch (e) {
      setError(userMessage(e));
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        footer={
          <StickyActions>
            <Button label="Annuler" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} disabled={busy} style={{ flex: 1 }} />
            <Button
              label="Supprimer définitivement"
              variant="destructive"
              onPress={submit}
              disabled={!typed || !online}
              loading={busy}
              icon={<Trash2 size={18} color={!typed || !online ? color.ink3 : color.dangerInk} strokeWidth={2.2} />}
              accessibilityHint="Supprime votre compte et vos données. Action irréversible."
              testID="account-delete-submit"
              style={{ flex: 2 }}
            />
          </StickyActions>
        }
      >
        <DetailHeader parentLabel="Retour" title="Supprimer mon compte" sub={user?.email ?? undefined} />
        <View accessibilityRole="alert" style={{ flexDirection: "row", gap: space[3], padding: space[4], borderRadius: radius.card, backgroundColor: color.dangerSoft, borderWidth: 1, borderColor: color.dangerLine }}>
          <CircleAlert size={20} color={color.dangerInk} strokeWidth={2.2} />
          <Txt variant="bodyRegular" color={color.dangerInk} style={{ flex: 1, fontFamily: "Manrope_700Bold" }}>
            Action définitive : rien ne pourra être récupéré, ni par vous ni par le support.
          </Txt>
        </View>

        <SectionHeader title="Ce qui est supprimé" />
        <Card padded style={{ gap: space[3] }}>
          {DELETED.map((t) => (
            <Bullet key={t} text={t} tone="danger" />
          ))}
        </Card>

        <SectionHeader title="Ce qui est conservé ou bloquant" />
        <Card padded style={{ gap: space[3] }}>
          {KEPT.map((t) => (
            <Bullet key={t} text={t} tone="neutral" />
          ))}
        </Card>

        {memberships.length > 0 ? (
          <>
            <SectionHeader title="Vos organisations" count={memberships.length} />
            <Card padded style={{ gap: space[2] }}>
              {memberships.map((m) => (
                <Txt key={m.organization.id} variant="bodyRegular">
                  {m.organization.name} · {ROLE_LABEL[m.role]}
                </Txt>
              ))}
              <Txt variant="label">Le serveur vérifie les autres membres de chacune au moment de la suppression.</Txt>
            </Card>
          </>
        ) : null}

        <SectionHeader title="Confirmation" />
        <Card padded style={{ gap: space[3] }}>
          <TextField
            label={`Saisissez ${ACCOUNT_DELETE_CONFIRMATION} pour confirmer`}
            value={confirmation}
            onChangeText={(v) => {
              setConfirmation(v);
              setError(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="done"
            onSubmitEditing={submit}
            editable={!busy}
            placeholder={ACCOUNT_DELETE_CONFIRMATION}
            testID="account-delete-confirmation"
          />
          {!online ? <AlertBanner text="Hors ligne : la suppression demande une connexion pour être confirmée par le serveur." /> : null}
          {error ? (
            <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ padding: space[3], borderRadius: radius.lg, backgroundColor: color.dangerSoft }}>
              <Txt variant="bodyRegular" color={color.dangerInk} testID="account-delete-error">
                {error}
              </Txt>
            </View>
          ) : null}
          {busy ? <Txt variant="label" accessibilityLiveRegion="polite">Suppression en cours… ne fermez pas l'application.</Txt> : null}
        </Card>
        <Button label="Politique de confidentialité" variant="ghost" onPress={() => void openLegalPage("privacy")} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Bullet({ text, tone }: { text: string; tone: "danger" | "neutral" }) {
  return (
    <View style={{ flexDirection: "row", gap: space[3], alignItems: "flex-start" }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 8, backgroundColor: tone === "danger" ? color.danger : color.ink3 }} />
      <Txt variant="bodyRegular" style={{ flex: 1 }}>
        {text}
      </Txt>
    </View>
  );
}
