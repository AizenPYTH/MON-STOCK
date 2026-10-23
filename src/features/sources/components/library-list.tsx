import { CircleCheck, CircleX, ExternalLink, KeyRound } from "lucide-react";
import type { LibraryEntryDTO } from "@/services/sourcing/source-library";
import { StatusBadge } from "@/components/ui/status-badge";
import { Panel } from "@/components/instrument";
import { formatDateTime, formatMoney } from "@/lib/format";
import { safeExternalUrl } from "@/lib/utils";
import { ActivateLibraryForm } from "@/features/directory/components/activate-library-form";
import { CHECK_STATUS_LABEL, LIBRARY_ACCESS_LABEL, LIBRARY_SEGMENT_LABEL, sampleOf } from "@/features/sources/labels";

/**
 * Carte d'une source de la bibliothèque : résultat de sa DERNIÈRE VÉRIFICATION RÉELLE par le
 * serveur (robots.txt + produits avec prix, exemples à l'appui). Activation possible seulement
 * si elle est vérifiée « ok », après attestation (rédacteur).
 */
export function LibraryCard({ entry: e, canActivate }: { entry: LibraryEntryDTO; canActivate: boolean }) {
  const status = e.check?.status ?? null;
  const ok = status === "ok";
  const samples = sampleOf(e);
  const site = safeExternalUrl(e.website);
  return (
    <Panel as="article" className="flex flex-col gap-2 p-4">
        <div className="flex items-start gap-3">
          {e.sourceId || ok ? <CircleCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-success" /> : status === "not_configured" ? <KeyRound aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-warning" /> : <CircleX aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-muted" />}
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold leading-5">{e.name}</h3>
            <p className="text-[12.5px] font-semibold text-ink-3">
              {LIBRARY_SEGMENT_LABEL[e.segment]} · {e.country} · {LIBRARY_ACCESS_LABEL[e.access]}
            </p>
          </div>
          {e.sourceId ? <StatusBadge tone="success">Activée</StatusBadge> : e.blocked ? <StatusBadge tone="danger">Accès automatisé interdit</StatusBadge> : null}
        </div>
        <p className="text-xs leading-[17px] text-muted-strong">{e.notes}</p>
        {e.blocked ? <p className="text-xs font-semibold text-danger">{e.blocked}</p> : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={e.termsStatus === "confirmed" ? "success" : "warning"} title={e.termsLabel}>
            {e.termsStatus === "confirmed" ? "CGU / CGV confirmées" : "CGU / CGV à localiser"}
          </StatusBadge>
          {e.requiresTermsUrl && !e.sourceId ? <span className="text-xs font-medium text-muted">adresse des conditions exigée à l&apos;activation</span> : null}
        </div>
        <p className={ok ? "text-xs font-semibold text-success" : "text-xs text-muted-strong"}>
          {status ? `${CHECK_STATUS_LABEL[status] ?? status}${e.check?.checkedAt ? ` · ${formatDateTime(e.check.checkedAt)}` : ""}` : "Pas encore vérifiée"}
          {!ok && e.check?.message ? ` — ${e.check.message.slice(0, 160)}` : ""}
        </p>
        {samples.length > 0 ? (
          <div className="text-xs">
            <p className="text-muted">Relevé lors de la vérification :</p>
            <ul className="mt-0.5 space-y-0.5">
              {samples.map((s) => (
                <li key={s.title} className="flex min-w-0 justify-between gap-3">
                  <span className="truncate">{s.title}</span>
                  <span className="shrink-0 font-semibold tnum">{s.price === null ? "prix non communiqué" : formatMoney(s.price, s.currency ?? e.currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
          {site ? (
            <a href={site} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-strong hover:text-foreground hover:underline">
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              Site du fournisseur
            </a>
          ) : (
            <span />
          )}
        </div>
        {canActivate && !e.sourceId && e.activatable ? (
          <details className="rounded-xl border border-border bg-surface-2 px-3.5 py-1">
            <summary className="flex min-h-10 cursor-pointer items-center text-sm font-bold">Activer cette source</summary>
            <div className="pb-3 pt-1">
              <ActivateLibraryForm libraryKey={e.key} name={e.name} termsUrl={e.termsUrl} termsConfirmed={e.termsStatus === "confirmed"} />
            </div>
          </details>
        ) : null}
    </Panel>
  );
}
