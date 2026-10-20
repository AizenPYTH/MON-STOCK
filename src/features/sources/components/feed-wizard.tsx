"use client";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CatalogMapping, CatalogPreviewDTO } from "@/features/mobile-api/contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, FormError, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { formatNumber } from "@/lib/format";
import { IMPORT_MODE_HELP, IMPORT_MODE_LABEL, mappingIssues, TAX_OPTIONS, taxTypeOf, withTaxType, type ImportMode, type TaxChoice } from "@/features/catalog-imports/labels";
import { MappingEditor } from "@/features/catalog-imports/components/mapping-editor";
import { PreviewSample } from "@/features/catalog-imports/components/preview-sample";
import { Steps } from "@/features/catalog-imports/components/steps";
import { createRemoteFeedAction, previewRemoteFeedAction } from "@/features/sources/actions";
import { FEED_FREQUENCIES, remoteFeedIssues, type FeedAuthInput } from "@/features/sources/labels";

type Format = "csv" | "xml" | "json";
type FeedFrequency = (typeof FEED_FREQUENCIES)[number]["value"];

/**
 * Flux distant AUTORISÉ : lien CSV / XML / JSON fourni par le grossiste. Aperçu sans
 * enregistrement, association des colonnes, attestation obligatoire, puis création. Les
 * identifiants sont chiffrés par le serveur et ne sont plus jamais renvoyés au navigateur.
 */
export function FeedWizard({ suppliers, orgCurrency }: { suppliers: { id: string; name: string }[]; orgCurrency: string }) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"preview" | "create" | null>(null);
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<Format>("csv");
  const [rootPath, setRootPath] = useState("");
  const [authKind, setAuthKind] = useState<FeedAuthInput["kind"]>("none");
  const [headerName, setHeaderName] = useState("Authorization");
  const [headerValue, setHeaderValue] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [mapping, setMapping] = useState<CatalogMapping>({});
  const [currency, setCurrency] = useState(orgCurrency);
  const [taxType, setTaxType] = useState<TaxChoice>("unknown");
  const [mode, setMode] = useState<ImportMode>("snapshot");
  const [frequency, setFrequency] = useState<FeedFrequency>("daily");
  const [attest, setAttest] = useState(false);
  const [data, setData] = useState<CatalogPreviewDTO | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auth: FeedAuthInput = authKind === "header" ? { kind: "header", name: headerName.trim(), value: headerValue } : authKind === "basic" ? { kind: "basic", username: username.trim(), password } : { kind: "none" };
  const localIssues = url.trim() ? remoteFeedIssues({ url, auth }) : [];
  const issues = mappingIssues(mapping);
  const supplierOk = Boolean(supplierId) || supplierName.trim().length >= 2;
  const currencyOk = /^[A-Za-z]{3}$/.test(currency);
  const canCreate = Boolean(data && !dirty && issues.length === 0 && supplierOk && attest && currencyOk && busy === null);
  const step = !data ? (url.trim() ? 1 : 0) : !supplierOk ? 2 : issues.length || dirty ? 3 : 5;

  function resetPreview() {
    setData(null);
    setMapping({});
    setDirty(false);
  }

  function base() {
    return { url: url.trim(), format, auth, ...(rootPath.trim() ? { rootPath: rootPath.trim() } : {}) };
  }

  function runPreview(m?: CatalogMapping) {
    if (localIssues.length) {
      setError(localIssues[0]!);
      return;
    }
    setError(null);
    setBusy("preview");
    startTransition(async () => {
      const r = await previewRemoteFeedAction({ ...base(), mapping: m, defaults: { ...(currencyOk ? { currency } : {}), taxType } });
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
    });
  }

  function submit() {
    setError(null);
    setBusy("create");
    startTransition(async () => {
      const r = await createRemoteFeedAction({
        ...base(),
        mapping: withTaxType(mapping, taxType),
        defaults: { currency: currency.toUpperCase(), taxType },
        ...(supplierId ? { supplierId } : { supplierName: supplierName.trim() }),
        mode,
        frequency,
        attest,
      });
      setBusy(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // identifiants effacés du formulaire dès la création (jamais réaffichés)
      setHeaderValue("");
      setPassword("");
      toast.success("Flux ajouté. Lancez la première synchronisation depuis « Mes sources ».");
      router.push("/sourcing/sources" as never);
    });
  }

  return (
    <div className="space-y-5">
      <Steps steps={["Lien du flux", "Authentification", "Fournisseur", "Colonnes", "Synchronisation", "Autorisation"]} current={step} label="Étapes de l'ajout du flux" />
      {error ? (
        <div aria-live="assertive">
          <FormError message={error} />
        </div>
      ) : null}

      <Card>
        <CardHeader title="1. Lien du flux" description="MON STOCK ne lit que ce lien : aucune page web n'est parcourue. HTTPS public uniquement." />
        <CardContent className="grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
          <Field label="Adresse (https://…)" htmlFor={`${id}-url`} error={localIssues.length ? localIssues : undefined}>
            <Input
              id={`${id}-url`}
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                resetPreview();
              }}
              placeholder="https://fournisseur.example/stock.csv"
              maxLength={2000}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Format" htmlFor={`${id}-format`}>
            <Select
              id={`${id}-format`}
              value={format}
              onChange={(e) => {
                setFormat(e.target.value as Format);
                resetPreview();
              }}
            >
              <option value="csv">CSV</option>
              <option value="xml">XML</option>
              <option value="json">JSON</option>
            </Select>
          </Field>
          {format !== "csv" ? (
            <Field label="Chemin des articles (facultatif)" htmlFor={`${id}-root`} hint="Ex. products.product ; laissé vide, il est détecté.">
              <Input
                id={`${id}-root`}
                value={rootPath}
                onChange={(e) => {
                  setRootPath(e.target.value);
                  resetPreview();
                }}
                maxLength={200}
              />
            </Field>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="2. Authentification" description={authKind === "none" ? "Lien public ou contenant déjà un jeton fourni par le grossiste." : "Chiffré par le serveur à l'enregistrement, jamais réaffiché ni envoyé ailleurs qu'au fournisseur."} />
        <CardContent className="space-y-4">
          <fieldset>
            <legend className="sr-only">Type d&apos;authentification</legend>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  ["none", "Aucune"],
                  ["header", "Clé / jeton (en-tête)"],
                  ["basic", "Identifiant et mot de passe"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name={`${id}-auth`}
                    value={k}
                    checked={authKind === k}
                    onChange={() => {
                      setAuthKind(k);
                      resetPreview();
                    }}
                    className="accent-accent"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {authKind === "header" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom de l'en-tête" htmlFor={`${id}-hname`}>
                <Input id={`${id}-hname`} value={headerName} onChange={(e) => setHeaderName(e.target.value)} maxLength={64} autoComplete="off" spellCheck={false} />
              </Field>
              <Field label="Valeur (clé, jeton…)" htmlFor={`${id}-hvalue`}>
                <Input id={`${id}-hvalue`} type="password" value={headerValue} onChange={(e) => setHeaderValue(e.target.value)} maxLength={2000} autoComplete="new-password" />
              </Field>
            </div>
          ) : null}
          {authKind === "basic" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Identifiant" htmlFor={`${id}-user`}>
                <Input id={`${id}-user`} value={username} onChange={(e) => setUsername(e.target.value)} maxLength={200} autoComplete="off" spellCheck={false} />
              </Field>
              <Field label="Mot de passe" htmlFor={`${id}-pass`}>
                <Input id={`${id}-pass`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={500} autoComplete="new-password" />
              </Field>
            </div>
          ) : null}
          <Button variant={data ? "secondary" : "primary"} onClick={() => runPreview(data ? withTaxType(mapping, taxType) : undefined)} disabled={!url.trim() || localIssues.length > 0 || pending} aria-busy={busy === "preview" || undefined}>
            {busy === "preview" ? "Lecture du flux par le serveur…" : data ? "Actualiser l'aperçu" : "Tester le lien"}
          </Button>
        </CardContent>
      </Card>

      {data ? (
        <>
          <Card>
            <CardHeader title="3. Fournisseur" />
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Fournisseur" htmlFor={`${id}-supplier`}>
                <Select id={`${id}-supplier`} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Nouveau fournisseur…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {!supplierId ? (
                <Field label="Nom du nouveau fournisseur" htmlFor={`${id}-sname`} hint="2 à 160 caractères. Un fournisseur du même nom est réutilisé.">
                  <Input id={`${id}-sname`} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} maxLength={160} />
                </Field>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="4. Colonnes du flux"
              description={`${formatNumber(data.total)} lignes · ${formatNumber(data.validCount)} exploitables · ${formatNumber(data.invalidCount)} incomplètes`}
              actions={data.mappingSource === "suggested" ? <Badge variant="info">Colonnes proposées automatiquement</Badge> : null}
            />
            <CardContent className="space-y-4">
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
                <Field label="Devise des prix (si absente du flux)" htmlFor={`${id}-currency`} error={currencyOk ? undefined : "Devise sur 3 lettres (EUR, USD…)."}>
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
                <Button variant="secondary" onClick={() => runPreview(withTaxType(mapping, taxType))} disabled={pending}>
                  {busy === "preview" ? "Actualisation…" : "Actualiser l'aperçu"}
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title={`Aperçu (${data.sample.length} premières lignes)`} description="Lu par le serveur, rien n'est encore enregistré." />
            <PreviewSample sample={data.sample} limit={10} />
          </Card>

          <Card>
            <CardHeader title="5. Synchronisation" description="En cas de panne du fournisseur, les offres déjà enregistrées sont conservées et un nouvel essai est programmé." />
            <CardContent className="grid gap-4 md:grid-cols-2">
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium text-foreground">Mode</legend>
                {(["snapshot", "partial"] as const).map((m) => (
                  <label key={m} className="flex items-start gap-2 text-sm">
                    <input type="radio" name={`${id}-mode`} value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-1 accent-accent" />
                    <span>
                      <span className="font-medium">{IMPORT_MODE_LABEL[m]}</span>
                      <span className="block text-xs text-muted">{IMPORT_MODE_HELP[m]}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <Field label="Fréquence" htmlFor={`${id}-freq`}>
                <Select id={`${id}-freq`} value={frequency} onChange={(e) => setFrequency(e.target.value as FeedFrequency)}>
                  {FEED_FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="6. Autorisation" />
            <CardContent className="space-y-3">
              <label htmlFor={`${id}-attest`} className="flex items-start gap-2 text-sm">
                <Checkbox id={`${id}-attest`} checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-0.5" />
                <span>J&apos;atteste que ce fournisseur m&apos;a fourni ce lien ou m&apos;autorise à le lire automatiquement.</span>
              </label>
              <p className="text-xs text-muted">Votre attestation est enregistrée avec la date. Aucune commande n&apos;est passée : MON STOCK lit seulement le stock et les prix.</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={submit} disabled={!canCreate || pending} aria-busy={busy === "create" || undefined}>
                  {busy === "create" ? "Ajout du flux…" : "Ajouter ce flux"}
                </Button>
                {!attest ? <span className="text-sm text-muted">L&apos;attestation est obligatoire.</span> : null}
                {dirty ? <span className="text-sm text-muted">Actualisez l&apos;aperçu après vos changements.</span> : null}
                {!supplierOk ? <span className="text-sm text-danger">Choisissez le fournisseur de ce flux.</span> : null}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
