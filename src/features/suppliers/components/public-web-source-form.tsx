"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, FormSuccess, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { createPublicWebSourceAction } from "@/features/suppliers/actions";

export function PublicWebSourceButton({ supplierId, parsers }: { supplierId: string; parsers: Array<{ key: string; label: string; description: string }> }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult<{ robots: string }> | null, FormData>(createPublicWebSourceAction, null);
  const err = state && !state.ok ? state : null;
  const fe = err?.fieldErrors;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Ajouter une page publique
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Nouvelle source : page publique autorisée" className="max-w-2xl">
        <form action={action} className="space-y-4">
          <input type="hidden" name="supplier_id" value={supplierId} />
          <FormError message={err?.error} />
          {state?.ok ? <FormSuccess message={`Source créée. ${state.data.robots}`} /> : null}
          <div className="rounded-lg border border-amber-200 bg-warning-soft p-3 text-xs text-amber-900">
            Le crawler ne lit que des pages publiques, sans connexion, sans cookie, sans contournement de protection, en respectant robots.txt (délai minimum 2 s, 1 requête à la fois) et avec un User-Agent identifiable. Vérifiez vous-même les conditions d'utilisation du site avant d'ajouter une source.
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom de la source" htmlFor="pw_name" error={fe?.name}>
              <Input id="pw_name" name="name" required placeholder="Catalogue public" />
            </Field>
            <Field label="URL de base" htmlFor="pw_base" error={fe?.base_url}>
              <Input id="pw_base" name="base_url" type="url" required placeholder="https://www.exemple.com" />
            </Field>
            <Field label="Pages à lire (une URL par ligne, même domaine)" htmlFor="pw_urls" error={fe?.urls} className="sm:col-span-2" hint="50 URLs maximum, 20 pages lues par synchronisation par défaut.">
              <Textarea id="pw_urls" name="urls" required placeholder={"https://www.exemple.com/catalogue?page=1\nhttps://www.exemple.com/catalogue?page=2"} />
            </Field>
            <Field label="Parser" htmlFor="pw_parser" error={fe?.parser} hint={parsers.map((p) => `${p.label} : ${p.description}`).join(" ")}>
              <Select id="pw_parser" name="parser" defaultValue="jsonld">
                {parsers.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fréquence" htmlFor="pw_freq" error={fe?.sync_frequency}>
              <Select id="pw_freq" name="sync_frequency" defaultValue="manual">
                <option value="manual">Manuelle</option>
                <option value="hourly">Toutes les heures</option>
                <option value="every_6_hours">Toutes les 6 heures</option>
                <option value="daily">Quotidienne</option>
              </Select>
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
            <Field label="Pages max par synchronisation" htmlFor="pw_max" error={fe?.max_pages}>
              <Input id="pw_max" name="max_pages" type="number" min={1} max={50} step={1} defaultValue={20} />
            </Field>
            <Field label="Conditions d'accès vérifiées (référence CGU, autorisation écrite…)" htmlFor="pw_access" error={fe?.access_conditions} className="sm:col-span-2">
              <Textarea id="pw_access" name="access_conditions" placeholder="ex. CGU §4 : données produit publiques réutilisables ; accord commercial du 12/09/2026." />
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox name="automated_access_confirmed" className="mt-0.5" />
            <span>J'atteste avoir vérifié que l'accès automatisé est autorisé par les conditions d'utilisation de ce site.</span>
          </label>
          {fe?.automated_access_confirmed ? <p className="text-xs text-danger">{fe.automated_access_confirmed.join(" ")}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Fermer
            </Button>
            <SubmitButton pendingText="Vérification robots.txt…">Créer la source</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
