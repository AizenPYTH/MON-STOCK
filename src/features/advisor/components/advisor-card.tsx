"use client";
import { useState } from "react";
import { AlertTriangle, Check, Copy, FileText } from "lucide-react";
import type { AdvisorActionDTO, AdvisorCardDTO } from "@/features/mobile-api/contract";
import { cn } from "@/lib/utils";
import { ACTION_STATUS, CARD_TONE_CLASS, displayedActionStatus, formatActionAmount } from "@/features/advisor/view.pure";

/**
 * Cartes du conseiller (v5) : résultats calculés par le SERVEUR à partir des données (jamais
 * rédigés par le modèle), action préparée à confirmer (filet ambre 2 px), brouillon à copier.
 */

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

const STATUS_PILL = {
  accent: "bg-warning-soft text-warning",
  neutral: "bg-line-soft text-muted",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
} as const;

function CopyDraft({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (!navigator.clipboard) return setFailed(true);
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            setFailed(false);
            window.setTimeout(() => setCopied(false), 2000);
          },
          () => setFailed(true),
        );
      }}
      aria-label="Copier le brouillon"
      className={cn("relative flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border-strong px-2.5 text-[12.5px] font-bold hover:bg-line-soft after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']", FOCUS)}
    >
      {copied ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
      {copied ? "Copié" : failed ? "Copie impossible" : "Copier"}
    </button>
  );
}

export function AdvisorCardView({
  card,
  busyActionId,
  canConfirm,
  onConfirm,
  onCancel,
}: {
  card: AdvisorCardDTO;
  busyActionId: string | null;
  canConfirm: boolean;
  onConfirm: (a: AdvisorActionDTO) => void;
  onCancel: (a: AdvisorActionDTO) => void;
}) {
  if (card.kind === "action" && card.action) {
    return <ActionCard title={card.title} subtitle={card.subtitle} action={card.action} busy={busyActionId === card.action.id} disabled={busyActionId !== null} canConfirm={canConfirm} onConfirm={onConfirm} onCancel={onCancel} />;
  }
  return (
    <section className="ms-fade flex w-full max-w-[560px] flex-col gap-2 self-stretch rounded-2xl border border-border bg-surface p-4" aria-label={`${card.title}${card.subtitle ? `, ${card.subtitle}` : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-xs font-bold leading-4 tracking-[0.4px] text-ink-3">{card.title}</h3>
          {card.subtitle ? <p className="text-[13px] font-semibold text-ink-3">{card.subtitle}</p> : null}
        </div>
        {card.kind === "draft" && card.text ? <CopyDraft text={card.text} /> : null}
      </div>
      {card.kind === "draft" && card.text ? (
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-3">
            <FileText aria-hidden="true" className="h-3.5 w-3.5" /> Brouillon — rien n&apos;est envoyé automatiquement
          </p>
          <p className="whitespace-pre-wrap rounded-xl bg-background px-3 py-2.5 text-sm font-medium text-foreground">{card.text}</p>
        </div>
      ) : null}
      {card.rows.length > 0 ? (
        <dl className="flex flex-col">
          {card.rows.map((r, i) => (
            <div key={`${r.label}-${i}`} className={cn("flex items-start gap-3 pt-2", i > 0 && "mt-2 border-t border-line-soft")}>
              <dt className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold leading-5 text-foreground">{r.label}</span>
                {r.detail ? <span className="text-[13px] font-semibold text-ink-3">{r.detail}</span> : null}
              </dt>
              <dd className={cn("shrink-0 whitespace-nowrap text-right text-[15px] font-extrabold tnum", CARD_TONE_CLASS[r.tone])}>{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {card.warnings.length > 0 ? (
        <ul className="flex flex-col gap-1 pt-1">
          {card.warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5 text-[13px] font-semibold text-warning">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Confirmation explicite : action, objet, montant ; un clic = cette action seulement. */
function ActionCard({
  title,
  subtitle,
  action,
  busy,
  disabled,
  canConfirm,
  onConfirm,
  onCancel,
}: {
  title: string;
  subtitle: string | null;
  action: AdvisorActionDTO;
  busy: boolean;
  disabled: boolean;
  canConfirm: boolean;
  onConfirm: (a: AdvisorActionDTO) => void;
  onCancel: (a: AdvisorActionDTO) => void;
}) {
  const status = displayedActionStatus(action);
  const st = ACTION_STATUS[status];
  const pending = status === "pending";
  const amount = formatActionAmount(action.amount, action.currency);
  const until = new Date(action.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return (
    <section className={cn("ms-fade flex w-full max-w-[560px] flex-col gap-3 self-stretch rounded-2xl border-2 bg-surface p-4", pending ? "border-amber" : "border-border")} aria-label={`${title}. ${action.summary}. ${st.label}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold leading-4 tracking-[0.4px] text-ink-3">{title}</h3>
        <span className={cn("shrink-0 rounded-md px-2 py-[3px] text-[11px] font-bold", STATUS_PILL[st.tone])}>{st.label}</span>
      </div>
      <p className="text-[15px] font-semibold leading-[21px] text-foreground">{action.summary}</p>
      {amount ? <p className="text-[13px] font-semibold text-ink-3">Montant concerné : {amount}</p> : null}
      {action.outcome ? <p className={cn("text-[13px] font-semibold", action.status === "executed" ? "text-success" : action.status === "failed" ? "text-danger" : "text-muted")}>{action.outcome}</p> : null}
      {pending ? (
        <>
          <p className="text-[13px] font-semibold text-ink-3">
            {subtitle ?? "Rien n'est modifié sans votre confirmation."} Valable jusqu&apos;à {until}.
          </p>
          {!canConfirm ? <p className="text-[13px] font-semibold text-warning">Votre rôle (lecture seule) ne permet pas de confirmer cette action.</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => onCancel(action)} disabled={disabled} className={cn("min-h-10 flex-1 rounded-[10px] border border-border-strong bg-surface text-sm font-extrabold hover:bg-line-soft disabled:opacity-50", FOCUS)}>
              Annuler
            </button>
            <button
              type="button"
              onClick={() => onConfirm(action)}
              disabled={disabled || !canConfirm}
              aria-busy={busy || undefined}
              title={!canConfirm ? "Rôle lecture seule" : undefined}
              className={cn("min-h-10 flex-1 rounded-[10px] bg-mint text-sm font-extrabold text-night hover:bg-mint-pressed disabled:opacity-50", FOCUS)}
            >
              {busy ? "Traitement…" : "Confirmer"}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
