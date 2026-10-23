"use client";
import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FileSpreadsheet, FileUp, Loader2, TriangleAlert } from "lucide-react";
import type { CatalogImportDTO, CatalogMapping, CatalogPreviewDTO } from "@/features/mobile-api/contract";
import type { ActionResult } from "@/lib/result";
import { MonoTitle, Panel, Paper, Scene, SceneHeader, SplitBar } from "@/components/instrument";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { Callout } from "@/components/ui/page";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ACCEPT_ATTRIBUTE, fileIssue, fileSizeLabel, IMPORT_MODE_HELP, IMPORT_MODE_LABEL, IMPORT_PART_COLOR, mappingIssues, TAX_OPTIONS, taxTypeOf, withTaxType, type ImportMode, type ImportTone, type TaxChoice } from "@/features/catalog-imports/labels";
import { MappingEditor } from "@/features/catalog-imports/components/mapping-editor";
import { describeUploadResponse, TOO_LARGE_ONLINE, UNREACHABLE_UPLOAD } from "@/features/catalog-imports/upload-response";
import { WEB_UPLOAD_MAX_LABEL, webUploadTooLargeMessage } from "@/lib/upload-limits";
import { PreviewSample } from "@/features/catalog-imports/components/preview-sample";
import { Steps } from "@/features/catalog-imports/components/steps";
import { ChoiceChips } from "@/features/catalog-imports/components/choice-chips";
import { StatusPill } from "@/features/catalog-imports/components/status-pill";
import { ImportProgress } from "@/features/catalog-imports/components/import-progress";

const PREVIEW_URL = "/sourcing/imports/new/preview";
const IMPORT_URL = "/sourcing/imports/new/import";
const STEPS = ["Fournisseur", "Fichier", "Colonnes", "Vérifier", "Résultat"];
/** Au-delà, le choix du fournisseur passe d'une rangée de puces à une liste déroulante. */
const MAX_SUPPLIER_CHIPS = 16;
const NEW_SUPPLIER = "__new__";

type View = 0 | 1 | 2 | 3 | 4;

async function postCatalog<T>(url: string, file: File, options: Record<string, unknown>): Promise<ActionResult<T>> {
  const fd = new FormData();
  // options AVANT le fichier, avec sa taille attendue : le serveur refuse un fichier reçu tronqué
  fd.set("options", JSON.stringify({ ...options, fileSize: file.size }));
  fd.set("file", file);
  // Refus immédiat, avant l'envoi, de ce que la plateforme refuserait (W-09).
  if (webUploadTooLargeMessage(file.size)) return { ok: false, error: TOO_LARGE_ONLINE };
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: fd, credentials: "same-origin" });
  } catch {
    return { ok: false, error: UNREACHABLE_UPLOAD };
  }
  // Redirection vers /login, 413, 5xx, délai dépassé : chacun son message (W-21).
  const failure = describeUploadResponse({ redirected: res.redirected, url: res.url, status: res.status, contentType: res.headers.get("content-type") });
  if (failure) return failure;
  try {
    return (await res.json()) as ActionResult<T>;
  } catch {
    // Corps coupé en cours de lecture (connexion interrompue) ou JSON invalide.
    return { ok: false, error: res.status === 413 ? TOO_LARGE_ONLINE : `Réponse du serveur incomplète ou illisible (HTTP ${res.status}). Vérifiez l'historique des imports avant de réessayer.` };
  }
}

function StepTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[17px] font-bold leading-[22px]">{children}</h2>;
}

/**
 * Assistant d'import du catalogue / de la grille tarifaire d'un fournisseur (CSV, Excel .xlsx,
 * XML ou JSON ; 4 Mo depuis le site, 15 Mo depuis l'iPhone), en v5 : étapes sur la scène nuit (Fournisseur → Fichier →
 * Colonnes → Vérifier → Résultat), une étape à la fois sur le papier, historique à droite.
 * Rien n'est enregistré avant la confirmation de l'étape « Vérifier » ; les prix sont datés.
 */
export function ImportWizard({ suppliers, orgCurrency, initialSupplierId, initialSupplierName, history }: { suppliers: { id: string; name: string }[]; orgCurrency: string; initialSupplierId: string | null; initialSupplierName: string; history: ReactNode }) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const initialId = initialSupplierId && suppliers.some((s) => s.id === initialSupplierId) ? initialSupplierId : "";
  const [supplierId, setSupplierId] = useState<string>(initialId);
  const [supplierName, setSupplierName] = useState(initialSupplierName);
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<CatalogMapping>({});
  const [currency, setCurrency] = useState(orgCurrency);
  const [taxType, setTaxType] = useState<TaxChoice>("unknown");
  const [mode, setMode] = useState<ImportMode>("partial");
  const [data, setData] = useState<CatalogPreviewDTO | null>(null);
  const [result, setResult] = useState<CatalogImportDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<{ label: string; href: string } | undefined>(undefined);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [allRows, setAllRows] = useState(false);
  const supplierOk = Boolean(supplierId) || supplierName.trim().length >= 2;
  const [view, setView] = useState<View>(initialId || initialSupplierName.trim().length >= 2 ? 1 : 0);

  const supplierLabel = supplierId ? (suppliers.find((s) => s.id === supplierId)?.name ?? "ce fournisseur") : supplierName.trim();

  function showError(r: { error: string; action?: { label: string; href: string } }) {
    setError(r.error);
    setErrorAction(r.action);
  }

  async function refresh(f: File, m: CatalogMapping | undefined, forSupplier: string = supplierId) {
    setBusy("preview");
    setError(null);
    const r = await postCatalog<CatalogPreviewDTO>(PREVIEW_URL, f, { mapping: m, defaults: { currency: /^[A-Za-z]{3}$/.test(currency) ? currency : undefined, taxType }, supplierId: forSupplier || undefined });
    setBusy(null);
    if (!r.ok) {
      showError(r);
      return;
    }
    setData(r.data);
    setMapping(r.data.mapping);
    const t = taxTypeOf(r.data.mapping);
    if (t !== "unknown") setTaxType(t);
    setDirty(false);
    setView((v) => (v === 1 ? 2 : v));
  }

  function choose(f: File | null) {
    setResult(null);
    setData(null);
    setError(null);
    setFile(null);
    setAllRows(false);
    if (!f) return;
    // Contrôle du format puis de la limite d'envoi depuis le site (dès le choix du fichier).
    const issue = fileIssue(f) ?? (webUploadTooLargeMessage(f.size) ? TOO_LARGE_ONLINE : null);
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
      showError(r);
      return;
    }
    setResult(r.data);
    setView(4);
  }

  function restart() {
    setResult(null);
    setData(null);
    setFile(null);
    setMapping({});
    setDirty(false);
    setError(null);
    setAllRows(false);
    if (fileInput.current) fileInput.current.value = "";
    setView(supplierOk ? 1 : 0);
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    if (busy !== null) return;
    choose(e.dataTransfer.files?.[0] ?? null);
  }

  const issues = mappingIssues(mapping);
  const currencyOk = /^[A-Za-z]{3}$/.test(currency);
  const columnsOk = Boolean(data && !dirty && issues.length === 0 && currencyOk);
  const canImport = Boolean(file && columnsOk && supplierOk && busy === null);
  const chips = suppliers.length <= MAX_SUPPLIER_CHIPS;

  return (
    <>
      <Scene>
        <SceneHeader
          eyebrow="Sourcing · imports de catalogues"
          title="Importer un catalogue"
          description={`CSV, Excel, XML ou JSON · ${WEB_UPLOAD_MAX_LABEL} max depuis le site (15 Mo depuis l'iPhone). Rien n'est enregistré avant votre confirmation.`}
          actions={
            <ButtonLink href="/sourcing/imports" variant="night">
              Historique des imports
            </ButtonLink>
          }
        />
        <Steps
          steps={STEPS}
          current={view}
          label="Étapes de l'import"
          onNight
          className="mt-[22px]"
          onSelect={
            view === 4
              ? undefined
              : (i) => {
                  setError(null);
                  setView(i as View);
                }
          }
        />
      </Scene>
      <Paper>
        <div className="flex flex-wrap items-start gap-7">
          <div className="flex min-w-0 flex-[1_1_620px] flex-col gap-4">
            {error ? (
              <div aria-live="assertive">
                <FormError message={error} action={errorAction} />
              </div>
            ) : null}

            {view === 0 ? (
              <Panel className="flex flex-col gap-3.5 p-5">
                <StepTitle>1. Fournisseur</StepTitle>
                <p className="-mt-2 text-sm font-medium text-muted">Choisissez le fournisseur du fichier : ses colonnes mémorisées seront reprises.</p>
                {chips ? (
                  <ChoiceChips
                    label="Fournisseur du catalogue"
                    options={[...suppliers.map((s) => ({ value: s.id, label: s.name })), { value: NEW_SUPPLIER, label: "Nouveau fournisseur" }]}
                    value={supplierId || NEW_SUPPLIER}
                    onChange={(v) => chooseSupplier(v === NEW_SUPPLIER ? "" : v)}
                  />
                ) : (
                  <label className="flex max-w-[420px] flex-col gap-1.5">
                    <span className="text-[13px] font-semibold text-muted">Fournisseur</span>
                    <select value={supplierId} onChange={(e) => chooseSupplier(e.target.value)} className="h-12 rounded-xl border border-border-control bg-surface px-3 text-[15px] font-semibold text-foreground focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/25">
                      <option value="">Nouveau fournisseur…</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {!supplierId ? (
                  <label htmlFor={`${id}-supplier-name`} className="flex max-w-[420px] flex-col gap-1.5">
                    <span className="text-[13px] font-semibold text-muted">Nouveau fournisseur</span>
                    <input
                      id={`${id}-supplier-name`}
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      maxLength={160}
                      placeholder="Nom du fournisseur"
                      aria-describedby={`${id}-supplier-hint`}
                      className="h-12 rounded-xl border border-border-control bg-surface px-3 text-[15px] font-semibold text-foreground transition-[border-color,box-shadow] duration-150 ease-standard placeholder:font-medium placeholder:text-ink-3 hover:border-muted focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/25"
                    />
                    <span id={`${id}-supplier-hint`} className="text-xs font-semibold text-ink-3">
                      2 à 160 caractères. Un fournisseur du même nom est réutilisé.
                    </span>
                  </label>
                ) : null}
                <div className="flex justify-end">
                  <Button size="lg" onClick={() => setView(1)} disabled={!supplierOk}>
                    Continuer
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </div>
              </Panel>
            ) : null}

            {view === 1 ? (
              <Panel className="flex flex-col gap-3.5 p-5">
                <StepTitle>2. Fichier{supplierLabel ? ` · ${supplierLabel}` : ""}</StepTitle>
                <label
                  htmlFor={`${id}-file`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-2.5 rounded-2xl border-[1.5px] border-dashed px-5 py-9 text-center transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
                    dragOver ? "border-ink-3 bg-selection" : "border-border-strong bg-surface-2 hover:border-ink-3 hover:bg-selection",
                    busy !== null && "pointer-events-none opacity-70",
                  )}
                >
                  <FileUp aria-hidden="true" className="h-6 w-6 text-muted" />
                  <span className="text-[15px] font-bold leading-5">Déposez le fichier ici ou choisissez-le</span>
                  <span className="text-[13px] font-semibold leading-[18px] text-ink-3">CSV, XLSX, XML ou JSON reçu par e-mail ou téléchargé depuis l&apos;espace pro du fournisseur · {WEB_UPLOAD_MAX_LABEL} maximum depuis le site (15 Mo depuis l&apos;iPhone)</span>
                  <input ref={fileInput} id={`${id}-file`} type="file" accept={ACCEPT_ATTRIBUTE} onChange={(e) => choose(e.target.files?.[0] ?? null)} disabled={busy !== null} className="sr-only" />
                  {busy === "preview" ? (
                    <span role="status" className="inline-flex items-center gap-2 text-[13px] font-bold text-info">
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                      Lecture du fichier et détection des colonnes…
                    </span>
                  ) : null}
                </label>
                {file ? (
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <FileSpreadsheet aria-hidden="true" className="h-4 w-4 text-muted" />
                    <span className="font-bold">{file.name}</span>
                    <span className="text-ink-3">{fileSizeLabel(file.size)}</span>
                  </p>
                ) : null}
                <div className="flex flex-wrap justify-between gap-2.5">
                  <Button variant="ghost" size="lg" onClick={() => setView(0)}>
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    Retour
                  </Button>
                  {data && busy === null ? (
                    <Button variant="secondary" size="lg" onClick={() => setView(2)}>
                      Colonnes
                      <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </Panel>
            ) : null}

            {view === 2 && data ? (
              <Panel className="flex flex-col gap-3.5 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <FileSpreadsheet aria-hidden="true" className="h-5 w-5 text-muted" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-bold leading-5">{file?.name ?? "Fichier"}</span>
                    <span className="text-[12.5px] font-semibold leading-[17px] text-ink-3 tnum">
                      {formatNumber(data.total)} lignes · {formatNumber(data.validCount)} exploitables · {formatNumber(data.invalidCount)} incomplètes (non importées)
                      {data.duplicates ? ` · ${formatNumber(data.duplicates)} doublon${data.duplicates > 1 ? "s" : ""} (première ligne gardée)` : ""}
                    </span>
                  </span>
                  {data.mappingSource === "saved" ? <StatusPill tone="success">Colonnes reprises du dernier import de ce fournisseur</StatusPill> : data.mappingSource === "suggested" ? <StatusPill tone="info">Colonnes proposées automatiquement</StatusPill> : null}
                </div>
                {data.alreadyImported ? (
                  <Callout tone="warning" title="Fichier déjà importé">
                    Ce fichier (contenu identique) a déjà été importé le {formatDateTime(data.alreadyImported.at)} : il ne sera pas réimporté sans votre confirmation.
                  </Callout>
                ) : null}
                {data.warnings.length ? (
                  <ul className="space-y-1 text-[12.5px] font-semibold text-warning">
                    {data.warnings.map((w) => (
                      <li key={w} className="flex items-start gap-1.5">
                        <TriangleAlert aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0">{w}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex flex-wrap items-start gap-5">
                  <div className="flex min-w-0 flex-[0_1_300px] flex-col gap-2.5 sm:min-w-[260px]">
                    <MonoTitle title="3. Colonnes du fichier" as="h3" />
                    <MappingEditor
                      layout="column"
                      preview={data}
                      mapping={mapping}
                      onChange={(m) => {
                        setMapping(m);
                        setDirty(true);
                      }}
                    />
                    <span className="mt-1 text-[13px] font-bold">
                      Type de prix
                    </span>
                    <ChoiceChips
                      label="Type de prix"
                      options={TAX_OPTIONS}
                      value={taxType}
                      onChange={(t) => {
                        setTaxType(t);
                        setDirty(true);
                      }}
                    />
                    <label htmlFor={`${id}-currency`} className="mt-1 flex flex-col gap-1">
                      <span className="text-[13px] font-bold">Devise des prix (si absente du fichier)</span>
                      <input
                        id={`${id}-currency`}
                        value={currency}
                        onChange={(e) => {
                          setCurrency(e.target.value.toUpperCase().slice(0, 3));
                          setDirty(true);
                        }}
                        maxLength={3}
                        aria-invalid={!currencyOk || undefined}
                        className={cn("ms-code h-10 w-[120px] rounded-[10px] border bg-surface px-2.5 text-[13px] uppercase text-foreground focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/25 pointer-coarse:text-base", currencyOk ? "border-border-control" : "border-danger")}
                      />
                    </label>
                    {!currencyOk ? (
                      <span role="alert" className="text-[13px] font-semibold text-danger">
                        Devise sur 3 lettres (EUR, USD…).
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-2.5">
                    <MonoTitle title={`Aperçu · ${Math.min(allRows ? data.sample.length : 6, data.sample.length)} premières lignes`} as="h3" />
                    <PreviewSample sample={data.sample} limit={allRows ? data.sample.length : 6} />
                    {data.sample.length > 6 ? (
                      <button type="button" onClick={() => setAllRows((x) => !x)} aria-expanded={allRows} className={buttonClasses("link", "sm", "min-h-10 self-start text-[13px]")}>
                        {allRows ? "Afficher 6 lignes" : `Afficher les ${data.sample.length} lignes de l'aperçu`}
                      </button>
                    ) : null}
                    <span className="text-xs font-semibold leading-[17px] text-ink-3">L&apos;aperçu n&apos;enregistre rien. Les lignes incomplètes ne seront pas importées.</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-line-soft pt-3.5">
                  <Button variant="ghost" size="lg" onClick={() => setView(1)}>
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    Autre fichier
                  </Button>
                  {dirty ? (
                    <Button variant="secondary" size="lg" onClick={() => file && void refresh(file, withTaxType(mapping, taxType))} disabled={busy !== null} aria-busy={busy === "preview" || undefined}>
                      {busy === "preview" ? "Actualisation…" : "Actualiser l'aperçu"}
                    </Button>
                  ) : (
                    <Button size="lg" onClick={() => setView(3)} disabled={!columnsOk}>
                      Vérifier {formatNumber(data.validCount)} ligne{data.validCount > 1 ? "s" : ""}
                      <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </Panel>
            ) : null}

            {view === 3 && data ? (
              <Panel className="flex flex-col gap-3.5 p-5">
                <StepTitle>4. Mode d&apos;import</StepTitle>
                <div role="radiogroup" aria-label="Mode d'import" className="flex max-w-[440px] rounded-xl bg-track p-[3px]">
                  {(["partial", "snapshot"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={mode === m}
                      onClick={() => setMode(m)}
                      className={cn("min-h-10 flex-1 rounded-[10px] px-2 text-[13px] font-bold transition-colors duration-150 ease-standard focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring", mode === m ? "bg-surface text-foreground shadow-raised" : "text-muted hover:text-foreground")}
                    >
                      {IMPORT_MODE_LABEL[m]}
                    </button>
                  ))}
                </div>
                <p className="text-[13.5px] font-semibold leading-[19px] text-muted">{IMPORT_MODE_HELP[mode]}</p>
                <div className="flex flex-col gap-1.5 rounded-[14px] border border-border bg-surface-2 p-4">
                  <span className="text-[15px] font-bold leading-5">Importer ce catalogue ?</span>
                  <span className="text-sm font-medium leading-5 text-muted">
                    {formatNumber(data.validCount)} offre{data.validCount > 1 ? "s" : ""} de <strong className="font-bold text-foreground">{supplierLabel || "ce fournisseur"}</strong> seront enregistrées ({taxType === "ht" ? "prix HT" : taxType === "ttc" ? "prix TTC" : "type de prix non précisé"}, {currency.toUpperCase()}), datées de cet import. {IMPORT_MODE_LABEL[mode]}. Les lignes incomplètes sont ignorées.
                  </span>
                </div>
                {!supplierOk ? <span className="flex items-center gap-1.5 text-sm font-semibold text-danger"><TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />Choisissez le fournisseur de ce catalogue (étape 1).</span> : null}
                {!columnsOk ? <span className="flex items-center gap-1.5 text-sm font-semibold text-danger"><TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />Corrigez les colonnes puis actualisez l&apos;aperçu (étape 3).</span> : null}
                <div className="flex flex-wrap justify-between gap-2.5">
                  <Button variant="ghost" size="lg" onClick={() => setView(2)}>
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    Colonnes
                  </Button>
                  <Button size="lg" onClick={() => void submit()} disabled={!canImport} aria-busy={busy === "import" || undefined}>
                    {busy === "import" ? "Import en cours…" : `Importer ${formatNumber(data.validCount)} ligne${data.validCount > 1 ? "s" : ""}`}
                  </Button>
                </div>
              </Panel>
            ) : null}

            {view === 4 && result ? <ImportResult result={result} mode={mode} busy={busy === "import"} onReimport={() => void submit({ allowSameFile: true })} onForce={() => void submit({ force: true })} onFix={() => setView(2)} onRestart={restart} /> : null}
          </div>
          <aside aria-label="Historique des imports" className="flex min-w-0 flex-[0_1_380px] flex-col gap-2.5">
            {history}
          </aside>
        </div>
      </Paper>
    </>
  );
}

function resultStatus(result: CatalogImportDTO): { label: string; tone: ImportTone } {
  const r = result.result;
  if (r.quarantined) return { label: "Import suspendu", tone: "warning" };
  if (result.alreadyImported) return { label: "Fichier déjà importé", tone: "neutral" };
  if (r.status === "success") return { label: "Import réussi", tone: "success" };
  if (r.status === "partial") return { label: "Import partiel", tone: "warning" };
  return { label: "Import en échec", tone: "danger" };
}

const MESSAGE_TONE: Record<ImportTone, string> = { success: "border-success-line bg-success-soft text-success-ink", warning: "border-warning-line bg-warning-soft text-warning-ink", danger: "border-danger-line bg-danger-soft text-danger-ink", info: "border-info-line bg-info-soft text-info-ink", neutral: "border-border bg-surface-2 text-muted-strong" };

function ImportResult({ result, mode, busy, onReimport, onForce, onFix, onRestart }: { result: CatalogImportDTO; mode: ImportMode; busy: boolean; onReimport: () => void; onForce: () => void; onFix: () => void; onRestart: () => void }) {
  const r = result.result;
  const status = resultStatus(result);
  const written = !result.alreadyImported && !r.quarantined && r.status !== "failed";
  const ignored = r.invalidRows + r.rejected + (r.duplicates ?? 0);
  const detailed = typeof r.created === "number" && typeof r.updated === "number" && typeof r.unchanged === "number";
  const figure = detailed ? (r.created ?? 0) + (r.updated ?? 0) + (r.unchanged ?? 0) : r.stored;
  return (
    <Panel className="flex flex-col gap-3.5 p-5" as="section">
      <h2 className="sr-only">5. Résultat</h2>
      <div aria-live="polite" className="flex flex-col gap-3.5">
        <StatusPill tone={status.tone} className="self-start">
          {status.label}
        </StatusPill>
        {written ? (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="text-[44px] font-light leading-[48px] tracking-[-1.6px] tnum sm:text-[60px] sm:leading-[62px] sm:tracking-[-2.4px]">{formatNumber(figure)}</span>
              <span className="text-[22px] font-medium text-ink-3">{detailed ? "offres à jour" : "offres enregistrées"}</span>
            </p>
            {detailed ? (
              <SplitBar
                className="max-w-[640px]"
                segments={[
                  { label: "Nouvelles", value: r.created ?? 0, color: IMPORT_PART_COLOR.created },
                  { label: "Mises à jour", value: r.updated ?? 0, color: IMPORT_PART_COLOR.updated },
                  { label: "Inchangées", value: r.unchanged ?? 0, color: IMPORT_PART_COLOR.unchanged },
                  { label: "Ignorées", value: ignored, color: IMPORT_PART_COLOR.ignored },
                ]}
              />
            ) : null}
            {r.expired > 0 ? (
              <p className="text-[13px] font-semibold text-muted tnum">
                {formatNumber(r.expired)} offre{r.expired > 1 ? "s" : ""} absente{r.expired > 1 ? "s" : ""} du catalogue complet, marquée{r.expired > 1 ? "s" : ""} expirée{r.expired > 1 ? "s" : ""} (historique conservé).
              </p>
            ) : null}
          </>
        ) : r.status === "failed" && !r.quarantined ? (
          <span aria-hidden="true" className="block h-3 rounded-full bg-track" />
        ) : null}
        <div className={cn("rounded-[14px] border px-4 py-3.5 text-sm font-semibold leading-5", MESSAGE_TONE[status.tone])}>{r.message}</div>
        {r.pending ? <ImportProgress progress={r.progress} className="max-w-[640px]" /> : null}
        {(r.quality?.warnings ?? []).map((w) => (
          <p key={w} className="text-[12.5px] font-semibold text-warning">
            {w}
          </p>
        ))}
        {r.quarantined ? (
          <Callout tone="warning" title="Rien n'a été modifié : vos offres actuelles sont conservées.">
            Vérifiez la correspondance des colonnes (prix, HT/TTC, devise) et l&apos;aperçu ; n&apos;importez quand même que si le fichier est correct.
            {(r.quality?.issues ?? []).length ? (
              <ul className="mt-2 list-disc pl-5">
                {(r.quality?.issues ?? []).map((i) => (
                  <li key={i.code}>{i.message}</li>
                ))}
              </ul>
            ) : null}
          </Callout>
        ) : null}
        {r.truncated ? <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-danger"><TriangleAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />Fichier tronqué : seules les premières lignes ont été traitées.</p> : null}
        {written ? (
          <p className="text-[13.5px] font-semibold leading-[19px] text-muted">
            Les offres apparaissent dans Sourcing et dans le radar d&apos;opportunités, datées de cet import.{" "}
            {mode === "snapshot" ? "Catalogue complet : les offres absentes de ce fichier ont été marquées « expirées »." : "Mise à jour partielle : les offres absentes de ce fichier n'ont pas été modifiées."}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2.5">
          {written ? (
            <Link href={"/sourcing" as never} className={buttonClasses("primary", "lg")}>
              Voir les offres
            </Link>
          ) : null}
          {result.alreadyImported ? (
            <Button variant="secondary" size="lg" onClick={onReimport} disabled={busy}>
              {busy ? "Import en cours…" : "Réimporter quand même"}
            </Button>
          ) : null}
          {r.quarantined ? (
            <Button variant="secondary" size="lg" onClick={onForce} disabled={busy}>
              {busy ? "Import en cours…" : "Importer quand même"}
            </Button>
          ) : null}
          {r.status === "failed" || r.quarantined ? (
            <Button variant={r.quarantined ? "ghost" : "primary"} size="lg" onClick={onFix} disabled={busy}>
              Corriger les colonnes et réessayer
            </Button>
          ) : null}
          {result.importJobId && !result.alreadyImported ? (
            <Link href={`/sourcing/imports/${result.importJobId}` as never} className={buttonClasses("secondary", "lg")}>
              {ignored > 1 ? `Rapport des ${formatNumber(ignored)} lignes ignorées` : ignored === 1 ? "Rapport de la ligne ignorée" : "Rapport de l'import"}
            </Link>
          ) : null}
          <Button variant="ghost" size="lg" onClick={onRestart} disabled={busy}>
            Nouvel import
          </Button>
        </div>
      </div>
    </Panel>
  );
}
