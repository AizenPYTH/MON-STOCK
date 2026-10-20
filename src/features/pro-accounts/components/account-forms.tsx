"use client";
import { useActionState, useId } from "react";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { connectProAccountAction, disconnectProAccountAction, syncProAccountAction, type AccountActionResult } from "@/features/pro-accounts/actions";
import { credentialFieldName } from "@/features/pro-accounts/credentials";

export interface ConnectorFieldView {
  name: string;
  label: string;
  secret: boolean;
  placeholder: string | null;
}

function Result({ state }: { state: AccountActionResult | null }) {
  if (!state) return null;
  if (!state.ok) return <FormError message={state.error} action={state.action} />;
  return state.data.ok ? <FormSuccess message={state.data.message} /> : <FormError message={`${state.data.message} Vérifiez les identifiants puis réessayez.`} />;
}

/**
 * Connexion API d'un compte : les identifiants partent uniquement vers le serveur MON STOCK, qui
 * les chiffre puis les teste réellement chez le fournisseur. Le formulaire est vidé après l'envoi
 * (React réinitialise les champs non contrôlés) et rien n'est jamais réaffiché.
 */
export function ConnectAccountForm({ accountKey, accountName, fields }: { accountKey: string; accountName: string; fields: ConnectorFieldView[] }) {
  const [state, action] = useActionState(connectProAccountAction, null);
  const id = useId();
  return (
    <form action={action} className="space-y-3" autoComplete="off" aria-label={`Connecter l'API ${accountName}`}>
      <input type="hidden" name="key" value={accountKey} />
      <p className="text-xs text-muted">Vos identifiants partent uniquement vers le serveur MON STOCK, qui les chiffre et les teste auprès du fournisseur. Ils ne sont ni conservés dans le navigateur ni réaffichés.</p>
      {fields.map((f) => (
        <Field key={f.name} label={f.label} htmlFor={`${id}-${f.name}`} hint={f.secret ? "Masqué à la saisie ; jamais réaffiché ni écrit dans les journaux." : undefined}>
          <Input
            id={`${id}-${f.name}`}
            name={credentialFieldName(f.name)}
            type={f.secret ? "password" : "text"}
            required
            maxLength={2000}
            placeholder={f.placeholder ?? undefined}
            autoComplete={f.secret ? "new-password" : "off"}
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
      ))}
      <Result state={state} />
      <SubmitButton size="sm" pendingText="Test par le serveur…">
        Connecter et tester
      </SubmitButton>
    </form>
  );
}

export function SyncAccountForm({ connectionId, label = "Synchroniser mes prix" }: { connectionId: string; label?: string }) {
  const [state, action] = useActionState(syncProAccountAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="connectionId" value={connectionId} />
      <SubmitButton size="sm" pendingText="Synchronisation…">
        {label}
      </SubmitButton>
      <Result state={state} />
    </form>
  );
}

export function DisconnectAccountForm({ connectionId, accountName }: { connectionId: string; accountName: string }) {
  const [state, action] = useActionState(disconnectProAccountAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="connectionId" value={connectionId} />
      <SubmitButton
        size="sm"
        variant="ghost"
        className="text-danger"
        pendingText="Déconnexion…"
        confirmMessage={`Déconnecter ${accountName} ? Les identifiants enregistrés sont supprimés du serveur. Les offres déjà reçues restent dans l'historique.`}
      >
        Déconnecter le compte
      </SubmitButton>
      <Result state={state} />
    </form>
  );
}
