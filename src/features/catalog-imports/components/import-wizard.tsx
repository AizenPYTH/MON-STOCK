"use client";
import { useId, useRef, useState } from "react";
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import type { CatalogImportDTO, CatalogMapping, CatalogPreviewDTO } from "@/features/mobile-api/contract";
import type { ActionResult } from "@/lib/result";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { Callout } from "@/components/ui/page";
import { formatDateTime, formatNumber } from "@/lib/format";
import { ACCEPT_ATTRIBUTE, fileIssue, fileSizeLabel, IMPORT_MODE_HELP, IMPORT_MODE_LABEL, mappingIssues, TAX_OPTIONS, taxTypeOf, withTaxType, type ImportMode, type TaxChoice } from "@/features/catalog-imports/labels";
import { MappingEditor } from "@/features/catalog-imports/components/mapping-editor";
import { PreviewSample } from "@/features/catalog-imports/components/preview-sample";
import { Steps } from "@/features/catalog-imports/components/steps";

const PREVIEW_URL = "/sourcing/imports/new/preview";
const IMPORT_URL = "/sourcing/imports/new/import";
/** Hébergé sur Vercel, le site refuse les envois de plus de ~4,5 Mo (limite de la plateforme, réponse 413). */
const TOO_LARGE_ONLINE = "Fichier trop volumineux pour être envoyé par le site (environ 4 Mo maximum en ligne) : importez-le depuis l'application iPhone (15 Mo maximum) ou configurez un flux automatique.";

async function postCatalog<T>(url: string, file: File, options: Record<string, unknown>): Promise<ActionResult<T>> {
  const fd = new FormData();
  // options AVANT le fichier, avec sa taille attendue : le serveur refuse un fichier reçu tronqué
  fd.set("options", JSON.stringify({ ...options, fileSize: file.size }));
  fd.set("file", file);
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: fd, credentials: "same-origin" });
  } catch {
    return { ok: false, error: "Le serveur MON STOCK est injoignable : vérifiez votre connexion puis réessayez." };
  }
  if (res.redirected || !(res.headers.get("content-type") ?? "").includes("application/json")) {
    return { ok: false, error: res.status === 413 ? TOO_LARGE_ONLINE : "Votre session a expiré. Reconnectez-vous pour continuer : rien n'a été enregistré.", action: { label: "Se reconnecter", href: "/login" } };
  }
  try {
    return (await res.json()) as ActionResult<T>;
  } catch {
    return { ok: false, error: res.status === 413 ? TOO_LARGE_ONLINE : `Réponse du serveur illisible (HTTP ${res.status}).` };
  }
}

/**
 * Assistant d'import du catalogue / de la grille tarifaire d'un fournisseur (CSV, Excel .xlsx,
 * XML ou JSON, 15 Mo maximum) : fournisseur → fichier → aperçu et colonnes → mode → import
 * confirmé. Rien n'est enregistré avant la confirmation ; les prix sont datés de l'import.
 */
export function ImportWizard({ suppliers, orgCurrency, initialSupplierId, initialSupplierName }: { suppliers: { id: string; name: string }[]; orgCurrency: string; initialSupplierId: string | null; initialSupplierName: string }) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [supplierId, setSupplierId] = useState<string>(initialSupplierId && suppliers.some((s) => s.id === initialSupplierId) ? initialSupplierId : "");
  const [supplierName, setSupplierName] = useState(initialSupplierName);
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<CatalogMapping>({});
  const [currency, setCurrency] = useState(orgCurrency);
  const [taxType, setTaxType] = useState<TaxChoice>("unknown");
  const [mode, setMode] = useState<ImportMode>("partial");
  const [data, setData] = useState<CatalogPreviewDTO | null>(null);
  const [result, setResult] = useState<CatalogImportDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const supplierLabel = supplierId ? (suppliers.find((s) => s.id === supplierId)?.name ?? "ce fournisseur") : supplierName.trim();

  async function refresh(f: File, m: CatalogMapping | undefined, forSupplier: string = supplierId) {
    setBusy("preview");
    setError(null);
    const r = await postCatalog<CatalogPreviewDTO>(PREVIEW_URL, f, { mapping: m, defaults: { currency: /^[A-Za-z]{3}$/.test(currency) ? currency : undefined, taxType }, supplierId: forSupplier || undefined });
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setData(r.data);
    setMapping(r.data.mapping);
    const t = taxTypeOf(r.data.mapping);
    if (t !== "unknown") setTaxType(t);
    setDirty(false);
  }

  function choose(f: File | null) {
    setResult(null);
    setData(null);
    setError(null);
    setFile(null);
    if (!f) return;
    const issue = fileIssue(f);
    if (issue) {
      setError(issue);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setFile(f);
    void refresh(f, undefined);
  }

  function chooseSupplier(next: string) {
    setSupplierId(next);
    // mapping mémorisé de ce fournisseur : nouvel aperçu tant que l'utilisateur n'a rien modifié
    if (file && data && !dirty && data.mappingSource !== "user") void refresh(file, undefined, next);
  }

  async function submit(opts: { force?: boolean; allowSameFile?: boolean } = {}) {
    if (!file) return;
    setConfirming(false);
    setBusy("import");
    setError(null);
    const target = supplierId || result?.supplierId || "";
    const r = await postCatalog<CatalogImportDTO>(IMPORT_URL, file, {
      mapping: withTaxType(mapping, taxType),
      defaults: { currency: currency.toUpperCase(), taxType },
      ...(target ? { supplierId: target } : { supplierName: supplierName.trim() }),
      mode,
      ...(opts.force ? { force: true } : {}),
      ...(opts.allowSameFile ? { allowSameFile: true } : {}),
    });
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setResult(r.data);
  }

  const issues = mappingIssues(mapping);
  const supplierOk = Boolean(supplierId) || supplierName.trim().length >= 2;
  const currencyOk = /^[A-Za-z]{3}$/.test(currency);
  const canImport = Boolean(file && data && !dirty && issues.length === 0 && supplierOk && currencyOk && busy === null);
  const step = result ? 4 : data ? (issues.length === 0 && !dirty ? 3 : 2) : file ? 1 : supplierOk ? 1 : 0;

  return (
    <div className="space-y-5">
      <Steps steps={["Fournisseur", "Fichier", "Colonnes", "Mode et vérification", "Résultat"]} current={step} label="Étapes de l'import" />
      {error ? (
        <div aria-live="assertive">
          <FormError message={error} />
        </div>
      ) : null}

      <Card>
        <CardHeader title="1. Fournisseur" description="Choisissez un fournisseur existant (sa correspondance de colonnes mémorisée sera reprise) ou indiquez le nom d'un nouveau fournisseur." />
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Fournisseur" htmlFor={`${id}-supplier`}>
            <Select id={`${id}-supplier`} value={supplierId} onChange={(e) => chooseSupplier(e.target.value)} disabled={Boolean(result)}>
              <option value="">Nouveau fournisseur…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          {!supplierId ? (
            <Field label="Nom du nouveau fournisseur" htmlFor={`${id}-supplier-name`} hint="2 à 160 caractères. Un fournisseur du même nom est réutilisé.">
              <Input id={`${id}-supplier-name`} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} maxLength={160} placeholder="Nom du fournisseur" disabled={Boolean(result)} />
            </Field>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="2. Fichier" description="CSV, Excel .xlsx, XML ou JSON reçu par e-mail ou téléchargé depuis l'espace pro du fournisseur · 15 Mo maximum." />
        <CardContent className="space-y-3">
          <Field label="Fichier du catalogue" htmlFor={`${id}-file`}>
            <input
              ref={fileInput}
              id={`${id}-file`}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
              disabled={busy !== null}
              className="block w-full text-sm text-muted-strong file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>
          {file ? (
            <p className="flex items-center gap-2 text-sm">
              <FileSpreadsheet aria-hidden="true" className="h-4 w-4 text-muted" />
              <span className="font-medium">{file.name}</span>
              <span className="text-muted">{fileSizeLabel(file.size)}</span>
              {busy === "preview" ? <span role="status" className="text-muted">Analyse du fichier par le serveur…</span> : null}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {data ? (
        <>
          <Card>
            <CardHeader
              title="3. Colonnes du fichier"
              description={`${formatNumber(data.total)} lignes · ${formatNumber(data.validCount)} exploitables · ${formatNumber(data.invalidCount)} incomplètes (non importées)${data.duplicates ? ` · ${formatNumber(data.duplicates)} doublon${data.duplicates > 1 ? "s" : ""} (première ligne gardée)` : ""}`}
              actions={data.mappingSource === "saved" ? <Badge variant="success">Colonnes reprises du dernier import de ce fournisseur</Badge> : data.mappingSource === "suggested" ? <Badge variant="info">Colonnes proposées automatiquement</Badge> : null}
            />
            <CardContent className="space-y-4">
              {data.alreadyImported ? (
                <Callout tone="warning" title="Fichier déjà importé">
                  Ce fichier (contenu identique) a déjà été importé le {formatDateTime(data.alreadyImported.at)} : il ne sera pas réimporté sans votre confirmation.
                </Callout>
              ) : null}
              {data.warnings.length ? (
                <ul className="space-y-0.5 text-xs text-muted-strong">
                  {data.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
              <MappingEditor
                preview={data}
                mapping={mapping}
                onChange={(m) => {
                  setMapping(m);
                  setDirty(true);
                }}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <fieldset>
                  <legend className="mb-1.5 text-sm font-medium text-foreground">Type de prix</legend>
                  <div className="flex flex-wrap gap-3">
                    {TAX_OPTIONS.map((o) => (
                      <label key={o.value} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="radio"
                          name={`${id}-tax`}
                          value={o.value}
                          checked={taxType === o.value}
                          onChange={() => {
                            setTaxType(o.value);
                            setDirty(true);
                          }}
                          className="accent-accent"
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Field label="Devise des prix (si absente du fichier)" htmlFor={`${id}-currency`} error={currencyOk ? undefined : "Devise sur 3 lettres (EUR, USD…)."}>
                  <Input
                    id={`${id}-currency`}
                    value={currency}
                    onChange={(e) => {
                      setCurrency(e.target.value.toUpperCase().slice(0, 3));
                      setDirty(true);
                    }}
                    maxLength={3}
                    className="w-28 uppercase"
                  />
                </Field>
              </div>
              {dirty ? (
                <Button variant="secondary" onClick={() => file && void refresh(file, withTaxType(mapping, taxType))} disabled={busy !== null} aria-busy={busy === "preview" || undefined}>
                  {busy === "preview" ? "Actualisation…" : "Actualiser l'aperçu"}
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="4. Mode d'import" />
            <CardContent className="space-y-2">
              <fieldset className="space-y-2">
                <legend className="sr-only">Mode d&apos;import</legend>
                {(["partial", "snapshot"] as const).map((m) => (
                  <label key={m} className="flex items-start gap-2 text-sm">
                    <input type="radio" name={`${id}-mode`} value={m} checked={mode === m} onChange={() => setMode(m)} disabled={Boolean(result)} className="mt-1 accent-accent" />
                    <span>
                      <span className="font-medium">{IMPORT_MODE_LABEL[m]}</span>
                      <span className="block text-xs text-muted">{IMPORT_MODE_HELP[m]}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title={`Aperçu (${data.sample.length} premières lignes)`} description="Lignes converties par le serveur, rien n'est encore enregistré." />
            <PreviewSample sample={data.sample} />
          </Card>

          {!result ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => setConfirming(true)} disabled={!canImport} aria-busy={busy === "import" || undefined}>
                {busy === "import" ? "Import en cours…" : `Importer ${formatNumber(data.validCount)} ligne${data.validCount > 1 ? "s" : ""}`}
              </Button>
              {dirty ? <span className="text-sm text-muted">Actualisez l&apos;aperçu après vos changements avant d&apos;importer.</span> : null}
              {!supplierOk ? <span className="text-sm text-danger">Choisissez le fournisseur de ce catalogue.</span> : null}
            </div>
          ) : null}
        </>
      ) : null}

      {result ? <ImportResult result={result} mode={mode} busy={busy === "import"} onReimport={() => void submit({ allowSameFile: true })} onForce={() => void submit({ force: true })} /> : null}

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Importer ce catalogue ?">
        <div className="space-y-4 text-sm">
          <p>
            {data ? formatNumber(data.validCount) : "—"} offres de <strong>{supplierLabel || "ce fournisseur"}</strong> seront enregistrées ({taxType === "ht" ? "prix HT" : taxType === "ttc" ? "prix TTC" : "type de prix non précisé"}, {currency}).
          </p>
          <p>
            <strong>{IMPORT_MODE_LABEL[mode]}</strong> : {IMPORT_MODE_HELP[mode]} Les lignes incomplètes sont ignorées.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Annuler
            </Button>
            <Button onClick={() => void submit()}>Confirmer l&apos;import</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function ImportResult({ result, mode, busy, onReimport, onForce }: { result: CatalogImportDTO; mode: ImportMode; busy: boolean; onReimport: () => void; onForce: () => void }) {
  const r = result.result;
  const label = r.quarantined ? "Import suspendu" : result.alreadyImported ? "Fichier déjà importé" : r.status === "success" ? "Import réussi" : r.status === "partial" ? "Import partiel" : "Import en échec";
  const tone = r.quarantined || result.alreadyImported ? "warning" : r.status === "failed" ? "danger" : r.status === "partial" ? "warning" : "success";
  return (
    <Card aria-live="polite">
      <CardHeader title="5. Résultat" actions={<Badge variant={tone}>{label}</Badge>} />
      <CardContent className="space-y-3 text-sm">
        <p>{r.message}</p>
        {!result.alreadyImported && !r.quarantined && r.status !== "failed" ? (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Nouvelles", r.created],
              ["Mises à jour", r.updated],
              ["Inchangées", r.unchanged],
              ["Ignorées", r.invalidRows + r.rejected + (r.duplicates ?? 0)],
              ["Expirées", r.expired],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-lg border border-border px-3 py-2">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="text-lg font-semibold tnum">{typeof v === "number" ? formatNumber(v) : "—"}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {(r.quality?.warnings ?? []).map((w) => (
          <p key={w} className="text-xs text-muted-strong">
            {w}
          </p>
        ))}
        {r.quarantined ? (
          <Callout tone="warning" title="Rien n'a été modifié : vos offres actuelles sont conservées.">
            Vérifiez la correspondance des colonnes (prix, HT/TTC, devise) et l&apos;aperçu ; n&apos;importez quand même que si le fichier est correct.
            {(r.quality?.issues ?? []).length ? (
              <ul className="mt-2 list-disc pl-5">
                {r.quality!.issues.map((i) => (
                  <li key={i.code}>{i.message}</li>
                ))}
              </ul>
            ) : null}
          </Callout>
        ) : null}
        {r.truncated ? <p className="text-xs text-danger">Fichier tronqué : seules les premières lignes ont été traitées.</p> : null}
        {!result.alreadyImported && !r.quarantined ? (
          <p className="text-xs text-muted">
            Les offres apparaissent dans Sourcing et dans le radar d&apos;opportunités, datées de cet import.{" "}
            {mode === "snapshot" ? "Catalogue complet : les offres absentes de ce fichier ont été marquées « expirées »." : "Mise à jour partielle : les offres absentes de ce fichier n'ont pas été modifiées."}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {result.alreadyImported ? (
            <Button variant="secondary" onClick={onReimport} disabled={busy}>
              {busy ? "Import en cours…" : "Réimporter quand même"}
            </Button>
          ) : null}
          {r.quarantined ? (
            <Button variant="secondary" onClick={onForce} disabled={busy}>
              {busy ? "Import en cours…" : "Importer quand même"}
            </Button>
          ) : null}
          {result.importJobId && !result.alreadyImported ? (
            <Link href={`/sourcing/imports/${result.importJobId}` as never} className={buttonClasses("secondary")}>
              Voir le détail de l&apos;import
            </Link>
          ) : null}
          <Link href={"/sourcing" as never} className={buttonClasses("primary")}>
            Voir les offres
          </Link>
          <Link href={"/sourcing/imports" as never} className={buttonClasses("ghost")}>
            Historique des imports
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
