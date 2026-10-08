"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, FormSuccess, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { connectSupplierAccountAction } from "@/features/suppliers/actions";
import type { AccountConnectorOption } from "@/features/suppliers/adapter-config";

/** « Connecter mon compte fournisseur » : identifiants envoyés une seule fois au serveur, chiffrés, jamais réaffichés. */
export function ConnectAccountDialog({ supplierId, connectors }: { supplierId: string; connectors: AccountConnectorOption[] }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(connectors[0]?.key ?? "");
  const [state, action] = useActionState<ActionResult<{ connectionId: string; message: string }> | null, FormData>(connectSupplierAccountAction, null);
  const err = state && !state.ok ? state : null;
  const fe = err?.fieldErrors;
  const connector = connectors.find((c) => c.key === key) ?? connectors[0] ?? null;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={connectors.length === 0} title={connectors.length === 0 ? "Aucun connecteur fournisseur disponible" : undefined}>
        Connecter mon compte fournisseur
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Connecter un compte fournisseur" className="max-w-xl">
        {connectors.length === 0 ? (
          <p className="text-sm text-muted">Aucun connecteur fournisseur disponible pour l&apos;instant.</p>
        ) : (
          <form action={action} className="space-y-4" autoComplete="off">
            <input type="hidden" name="supplier_id" value={supplierId} />
            <FormError message={err?.error} />
            {state?.ok ? <FormSuccess message={state.data.message} /> : null}
            <Field label="Connecteur" htmlFor="ca_key" error={fe?.connector_key}>
              <Select id="ca_key" name="connector_key" value={key} onChange={(e) => setKey(e.target.value)}>
                {connectors.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            {connector ? (
              <div className="rounded-lg bg-surface-muted/60 px-3 py-2 text-xs text-muted">
                <p>{connector.description}</p>
                {connector.accessConditions ? <p className="mt-1">Conditions d&apos;accès : {connector.accessConditions}</p> : null}
                <p className="mt-1 text-amber-700">Compte requis : vous connectez votre propre compte fournisseur. Les identifiants sont chiffrés côté serveur et ne sont jamais renvoyés au navigateur.</p>
              </div>
            ) : null}
            {connector?.credentialFields.map((f) => (
              <Field key={`${connector.key}-${f.name}`} label={f.label} htmlFor={`ca_${f.name}`} error={fe?.[`cred_${f.name}`]}>
                <Input id={`ca_${f.name}`} name={`cred_${f.name}`} type={f.secret ? "password" : "text"} autoComplete={f.secret ? "new-password" : "off"} required placeholder={f.placeholder} />
              </Field>
            ))}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Fermer
              </Button>
              <SubmitButton pendingText="Enregistrement chiffré…">Enregistrer la connexion</SubmitButton>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
