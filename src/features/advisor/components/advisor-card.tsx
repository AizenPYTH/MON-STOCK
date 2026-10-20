"use client";
import { useState } from "react";
import { AlertTriangle, Check, Copy, FileText } from "lucide-react";
import type { AdvisorActionDTO, AdvisorCardDTO } from "@/features/mobile-api/contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ACTION_STATUS, CARD_TONE_CLASS, displayedActionStatus, formatActionAmount } from "@/features/advisor/view.pure";

/**
 * Cartes du conseiller : résultats calculés par le SERVEUR à partir des données (jamais rédigés
 * par le modèle), action préparée à confirmer, brouillon de message à copier.
 */

const BADGE_TONE = { accent: "accent", neutral: "neutral", success: "success", danger: "danger" } as const;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
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
    >
      {copied ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
      {copied ? "Copié" : failed ? "Copie impossible" : "Copier"}
    </Button>
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
    <section className="rounded-xl border border-border bg-surface px-4 py-3" aria-label={`${card.title}${card.subtitle ? `, ${card.subtitle}` : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{card.title}</h3>
          {card.subtitle ? <p className="text-xs text-muted">{card.subtitle}</p> : null}
        </div>
        {card.kind === "draft" && card.text ? <CopyButton text={card.text} /> : null}
      </div>
      {card.kind === "draft" && card.text ? (
        <div className="mt-2 space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <FileText aria-hidden="true" className="h-3.5 w-3.5" /> Brouillon — rien n&apos;est envoyé automatiquement
          </p>
          <p className="whitespace-pre-wrap text-sm text-foreground">{card.text}</p>
        </div>
      ) : null}
      {card.rows.length > 0 ? (
        <dl className="mt-2 divide-y divide-border">
          {card.rows.map((r, i) => (
            <div key={`${r.label}-${i}`} className="flex items-start justify-between gap-4 py-1.5 text-sm">
              <dt className="min-w-0">
                <span className="text-foreground">{r.label}</span>
                {r.detail ? <span className="block text-xs text-muted">{r.detail}</span> : null}
              </dt>
              <dd className={cn("shrink-0 text-right font-semibold tnum", CARD_TONE_CLASS[r.tone])}>{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {card.warnings.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {card.warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5 text-xs text-amber-800">
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
    <section className={cn("rounded-xl border-2 bg-surface px-4 py-3", pending ? "border-accent" : "border-border")} aria-label={`${title}. ${action.summary}. ${st.label}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
        <Badge variant={BADGE_TONE[st.tone]}>{st.label}</Badge>
      </div>
      <p className="mt-1.5 text-sm text-foreground">{action.summary}</p>
      {amount ? <p className="mt-1 text-xs text-muted">Montant concerné : {amount}</p> : null}
      {action.outcome ? <p className={cn("mt-1 text-xs", action.status === "executed" ? "text-success" : "text-muted-strong")}>{action.outcome}</p> : null}
      {pending ? (
        <>
          <p className="mt-2 text-xs text-muted">
            {subtitle ?? "Rien n'est modifié sans votre confirmation."} Valable jusqu&apos;à {until}.
          </p>
          {!canConfirm ? <p className="mt-1 text-xs text-amber-800">Votre rôle (lecture seule) ne permet pas de confirmer cette action.</p> : null}
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => onCancel(action)} disabled={disabled}>
              Annuler l&apos;action
            </Button>
            <Button size="sm" onClick={() => onConfirm(action)} disabled={disabled || !canConfirm} aria-busy={busy || undefined}>
              {busy ? "Traitement…" : "Confirmer"}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
