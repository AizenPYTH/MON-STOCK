"use client";
import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, FormSuccess, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { createPublicWebSourceAction } from "@/features/suppliers/actions";
import { adapterSettingFields, attestationRequired, type PublicAdapterOption } from "@/features/suppliers/adapter-config";
import { RETRIEVAL_METHOD_LABEL } from "@/features/sourcing/labels";

export function PublicWebSourceButton({ supplierId, adapters }: { supplierId: string; adapters: PublicAdapterOption[] }) {
  const [open, setOpen] = useState(false);
  const [adapterKey, setAdapterKey] = useState<string>(adapters[0]?.key ?? "");
  const [state, action] = useActionState<ActionResult<{ robots: string }> | null, FormData>(createPublicWebSourceAction, null);
  const err = state && !state.ok ? state : null;
  const fe = err?.fieldErrors;
  const adapter = adapters.find((a) => a.key === adapterKey) ?? adapters[0] ?? null;
  const needsAttestation = adapter ? attestationRequired(adapter.method) : true;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={adapters.length === 0} title={adapters.length === 0 ? "Aucun adaptateur public disponible" : undefined}>
        Ajouter une source publique
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Nouvelle source publique (page, JSON ou flux)" className="max-w-2xl">
        {adapters.length === 0 ? (
          <p className="text-sm text-muted">Aucun adaptateur de source public n&apos;est disponible pour l&apos;instant.</p>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="supplier_id" value={supplierId} />
            <FormError message={err?.error} />
            {state?.ok ? <FormSuccess message={`Source créée. ${state.data.robots} Utilisez « Tester » pour vérifier la configuration.`} /> : null}
            <div className="rounded-lg border border-amber-200 bg-warning-soft p-3 text-xs text-amber-900">
              Lecture de données publiques uniquement : sans connexion, sans cookie, sans contournement de protection, en respectant robots.txt (délai minimum 2 s, 1 requête à la fois) et avec un User-Agent identifiable. Vérifiez vous-même les conditions d&apos;utilisation du site avant d&apos;ajouter une source.
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Adaptateur" htmlFor="pw_adapter" error={fe?.adapter} className="sm:col-span-2">
                <Select id="pw_adapter" name="adapter" value={adapterKey} onChange={(e) => setAdapterKey(e.target.value)}>
                  {adapters.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label} — {RETRIEVAL_METHOD_LABEL[a.method] ?? a.method}
                    </option>
                  ))}
                </Select>
              </Field>
              {adapter ? (
                <div className="rounded-lg bg-surface-muted/60 px-3 py-2 text-xs text-muted sm:col-span-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{RETRIEVAL_METHOD_LABEL[adapter.method] ?? adapter.method}</Badge>
                    <Badge variant="outline" className="font-mono">{adapter.key}</Badge>
                    {adapter.verification === "fixtures" ? <Badge variant="warning">Non testé en conditions réelles</Badge> : null}
                    <span>{adapter.capabilities.search ? "Recherche en direct" : "Catalogue synchronisé uniquement"}</span>
                    <span>· {adapter.capabilities.stockQuantity ? "quantité en stock communiquée" : "quantité en stock non communiquée par cette source"}</span>
                  </div>
                  <p className="mt-1">{adapter.description}</p>
                </div>
              ) : null}
              <Field label="Nom de la source" htmlFor="pw_name" error={fe?.name}>
                <Input id="pw_name" name="name" required placeholder="Catalogue public" />
              </Field>
              <Field label="URL de base" htmlFor="pw_base" error={fe?.base_url}>
                <Input id="pw_base" name="base_url" type="url" required placeholder="https://www.exemple.com" />
              </Field>
              {adapter ? adapterSettingFields(adapter.configFields).map((f) => (
                <Field key={`${adapter.key}-${f.name}`} label={`${f.label}${f.required ? "" : " (optionnel)"}`} htmlFor={`pw_cfg_${f.name}`} error={fe?.[`cfg_${f.name}`]} hint={f.help} className="sm:col-span-2">
                  <Input id={`pw_cfg_${f.name}`} name={`cfg_${f.name}`} required={f.required} placeholder={f.placeholder} />
                </Field>
              )) : null}
              <Field label="Pages de catalogue à lire lors d'une synchronisation (une URL par ligne, même domaine)" htmlFor="pw_urls" error={fe?.urls} className="sm:col-span-2" hint="Optionnel si l'adaptateur dispose d'une URL de recherche ou de flux. 50 URLs maximum, 20 pages lues par synchronisation par défaut.">
                <Textarea id="pw_urls" name="urls" placeholder={"https://www.exemple.com/catalogue?page=1\nhttps://www.exemple.com/catalogue?page=2"} />
              </Field>
              <Field label="Fréquence" htmlFor="pw_freq" error={fe?.sync_frequency}>
                <Select id="pw_freq" name="sync_frequency" defaultValue="manual">
                  <option value="manual">Manuelle</option>
                  <option value="hourly">Toutes les heures</option>
                  <option value="every_6_hours">Toutes les 6 heures</option>
                  <option value="daily">Quotidienne</option>
                </Select>
              </Field>
              <Field label="Pages max par synchronisation" htmlFor="pw_max" error={fe?.max_pages}>
                <Input id="pw_max" name="max_pages" type="number" min={1} max={50} step={1} defaultValue={20} />
              </Field>
              <Field label="Devise par défaut" htmlFor="pw_currency" error={fe?.default_currency}>
                <Input id="pw_currency" name="default_currency" maxLength={3} placeholder="EUR" />
              </Field>
              <Field label="Prix affichés" htmlFor="pw_tax" error={fe?.default_tax_type}>
                <Select id="pw_tax" name="default_tax_type" defaultValue="unknown">
                  <option value="unknown">HT/TTC non communiqué</option>
                  <option value="ht">HT</option>
                  <option value="ttc">TTC</option>
                </Select>
              </Field>
              <Field label="Pays (code)" htmlFor="pw_country" error={fe?.country}>
                <Input id="pw_country" name="country" maxLength={2} placeholder="FR" />
              </Field>
              <Field label="Conditions d'accès vérifiées (référence CGU, autorisation écrite…)" htmlFor="pw_access" error={fe?.access_conditions} className="sm:col-span-2">
                <Textarea id="pw_access" name="access_conditions" placeholder="ex. CGU §4 : données produit publiques réutilisables ; accord commercial du 12/09/2026." />
              </Field>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox name="automated_access_confirmed" className="mt-0.5" />
              <span>
                J&apos;atteste avoir vérifié que l&apos;accès automatisé est autorisé par les conditions d&apos;utilisation de ce site.
                {needsAttestation ? <span className="text-danger"> (obligatoire pour une page ou un JSON public)</span> : <span className="text-muted"> (recommandé : flux publié par le fournisseur)</span>}
              </span>
            </label>
            {fe?.automated_access_confirmed ? <p className="text-xs text-danger">{fe.automated_access_confirmed.join(" ")}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Fermer
              </Button>
              <SubmitButton pendingText="Vérification robots.txt…">Créer la source</SubmitButton>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
