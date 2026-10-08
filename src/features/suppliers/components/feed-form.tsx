"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FormError, FormSuccess, Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { ActionResult } from "@/lib/result";
import { RAW_OFFER_FIELDS, RAW_OFFER_FIELD_LABELS } from "@/domain/sourcing/types";
import { createFeedAction, previewFeedAction, type FeedPreviewResult } from "@/features/suppliers/actions";

const CONST_FIELDS = new Set(["currency", "tax_type", "country", "condition", "stock_status", "delivery_days", "moq"]);

export function FeedForm({ supplierId, defaultCurrency }: { supplierId: string; defaultCurrency: string }) {
  const [open, setOpen] = useState(false);
  const [previewState, previewAction, previewPending] = useActionState<ActionResult<FeedPreviewResult> | null, FormData>(previewFeedAction, null);
  const [createState, createAction, createPending] = useActionState<ActionResult<{ message: string }> | null, FormData>(createFeedAction, null);
  const preview = previewState?.ok ? previewState.data : null;
  const previewErr = previewState && !previewState.ok ? previewState : null;
  const createErr = createState && !createState.ok ? createState : null;
  const fe = { ...(previewErr?.fieldErrors ?? {}), ...(createErr?.fieldErrors ?? {}) };
  const columns = preview?.preview.columns ?? [];
  const mapping = preview?.suggestedMapping ?? {};

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Ajouter un flux CSV / XML / JSON
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader title="Nouveau flux fournisseur (CSV / XML / JSON)" description="1. Indiquez l'URL ou choisissez un fichier. 2. Prévisualisez. 3. Vérifiez le mapping des colonnes puis enregistrez. Pour un flux Google Merchant public, utilisez plutôt « Ajouter une source publique » avec l'adaptateur Flux Google Merchant (mapping automatique)." actions={<Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Fermer</Button>} />
      <CardContent>
        <form className="space-y-4">
          <input type="hidden" name="supplier_id" value={supplierId} />
          <FormError message={previewErr?.error} />
          <FormError message={createErr?.error} />
          {createState?.ok ? <FormSuccess message={createState.data.message} /> : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Nom du flux" htmlFor="fd_name" error={fe.name}>
              <Input id="fd_name" name="name" required placeholder="Tarif grossiste" />
            </Field>
            <Field label="Format" htmlFor="fd_format" error={fe.format}>
              <Select id="fd_format" name="format" defaultValue="csv">
                <option value="csv">CSV</option>
                <option value="xml">XML</option>
                <option value="json">JSON</option>
              </Select>
            </Field>
            <Field label="Contenu" htmlFor="fd_type" error={fe.type}>
              <Select id="fd_type" name="type" defaultValue="catalog">
                <option value="catalog">Catalogue complet</option>
                <option value="price">Prix</option>
                <option value="stock">Stock</option>
              </Select>
            </Field>
            <Field label="Fréquence (URL uniquement)" htmlFor="fd_freq" error={fe.sync_frequency}>
              <Select id="fd_freq" name="sync_frequency" defaultValue="manual">
                <option value="manual">Manuelle</option>
                <option value="hourly">Toutes les heures</option>
                <option value="every_6_hours">Toutes les 6 heures</option>
                <option value="daily">Quotidienne</option>
              </Select>
            </Field>
            <Field label="URL du flux" htmlFor="fd_url" error={fe.url} className="sm:col-span-2">
              <Input id="fd_url" name="url" type="url" placeholder="https://fournisseur.example/export.csv" />
            </Field>
            <Field label="ou fichier à importer" htmlFor="fd_file" error={fe.file} className="sm:col-span-2" hint="20 Mo maximum. Sans URL, le flux se met à jour par import manuel.">
              <Input id="fd_file" name="file" type="file" accept=".csv,.txt,.xml,.json,text/csv,application/xml,text/xml,application/json" />
            </Field>
            <Field label="Devise par défaut" htmlFor="fd_currency" error={fe.default_currency}>
              <Input id="fd_currency" name="default_currency" defaultValue={defaultCurrency} maxLength={3} />
            </Field>
            <Field label="Prix du flux" htmlFor="fd_tax" error={fe.default_tax_type}>
              <Select id="fd_tax" name="default_tax_type" defaultValue="unknown">
                <option value="unknown">HT/TTC non communiqué</option>
                <option value="ht">HT</option>
                <option value="ttc">TTC</option>
              </Select>
            </Field>
            <Field label="Pays (code)" htmlFor="fd_country" error={fe.country}>
              <Input id="fd_country" name="country" maxLength={2} placeholder="FR" />
            </Field>
            <Field label="Délimiteur CSV" htmlFor="fd_delim" error={fe.delimiter} hint="Vide = détection automatique">
              <Input id="fd_delim" name="delimiter" maxLength={3} />
            </Field>
            <Field label="Encodage" htmlFor="fd_enc" error={fe.encoding}>
              <Input id="fd_enc" name="encoding" placeholder="utf-8, latin1…" />
            </Field>
            <Field label="Chemin racine (XML/JSON)" htmlFor="fd_root" error={fe.root_path} hint="ex. rss.channel.item — vide = détection">
              <Input id="fd_root" name="root_path" />
            </Field>
            <Field label="Ligne d'entête (CSV)" htmlFor="fd_header" error={fe.header_row}>
              <Select id="fd_header" name="header_row" defaultValue="true">
                <option value="true">Oui</option>
                <option value="false">Non</option>
              </Select>
            </Field>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" variant="secondary" formAction={previewAction} disabled={previewPending}>
              {previewPending ? "Lecture du flux…" : "Prévisualiser (20 premières lignes)"}
            </Button>
          </div>

          {preview ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-surface-muted/60 px-3 py-2 text-xs text-muted">
                {preview.preview.total} ligne(s) lue(s) · {preview.preview.validCount} exploitable(s) · {preview.preview.invalidCount} incomplète(s) · {columns.length} colonne(s) détectée(s)
                {preview.preview.warnings.length > 0 ? ` · ${preview.preview.warnings.join(" · ")}` : ""}
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold">Mapping des colonnes</h4>
                <p className="mb-2 text-xs text-muted">Un mapping est proposé à partir des entêtes : vérifiez-le. Identifiant (ou référence / EAN), titre et prix sont obligatoires. Une constante remplace la colonne (ex. devise EUR pour tout le flux).</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {RAW_OFFER_FIELDS.map((field) => {
                    const current = mapping[field];
                    const col = typeof current === "string" ? current : "";
                    const cst = current && typeof current === "object" ? current.const : "";
                    return (
                      <div key={field} className="flex items-center gap-2 text-sm">
                        <label htmlFor={`map_${field}`} className="w-44 shrink-0 text-xs text-muted-strong">
                          {RAW_OFFER_FIELD_LABELS[field]}
                        </label>
                        <Select id={`map_${field}`} name={`map_${field}`} defaultValue={col} className="h-8 text-xs">
                          <option value="">—</option>
                          {columns.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </Select>
                        {CONST_FIELDS.has(field) ? <Input name={`const_${field}`} defaultValue={cst} placeholder="constante" className="h-8 w-28 text-xs" /> : null}
                      </div>
                    );
                  })}
                </div>
                {fe.map_title ? <p className="mt-1 text-xs text-danger">{fe.map_title.join(" ")}</p> : null}
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold">Aperçu après mapping</h4>
                <Table className="min-w-[720px] text-xs">
                  <THead>
                    <tr>
                      <TH>#</TH>
                      <TH>Identifiant</TH>
                      <TH>Titre</TH>
                      <TH align="right">Prix</TH>
                      <TH>Devise</TH>
                      <TH align="right">Stock</TH>
                      <TH align="right">MOQ</TH>
                      <TH>Erreurs</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {preview.preview.sample.map((s) => (
                      <TR key={s.index}>
                        <TD>{s.index + 1}</TD>
                        <TD className="font-mono">{s.offer?.externalOfferId ?? "—"}</TD>
                        <TD className="max-w-[280px] truncate">{s.offer?.title ?? "—"}</TD>
                        <TD align="right">{s.offer?.price ?? "—"}</TD>
                        <TD>{s.offer?.currency ?? "—"}</TD>
                        <TD align="right">{s.offer?.availableQuantity ?? "—"}</TD>
                        <TD align="right">{s.offer?.moq ?? "—"}</TD>
                        <TD className="text-danger">{s.errors.join(" ")}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <p className="mt-1 text-xs text-muted">Relancez la prévisualisation après avoir modifié le mapping pour vérifier le résultat.</p>
              </div>
              <div className="flex justify-end">
                <Button type="submit" formAction={createAction} disabled={createPending}>
                  {createPending ? "Enregistrement et première synchronisation…" : "Enregistrer le flux et synchroniser"}
                </Button>
              </div>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
