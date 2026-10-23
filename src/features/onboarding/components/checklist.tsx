import Link from "next/link";
import { Check, ChevronRight, Minus } from "lucide-react";
import { MonoTitle } from "@/components/instrument";
import { cn } from "@/lib/utils";
import { internalRoute } from "@/lib/routes";
import { checklistProgress, type ChecklistItem } from "@/features/onboarding/checklist";

const STATE_TEXT = { done: "Fait", todo: "À faire", unknown: "État inconnu" } as const;

/**
 * Checklist des premiers pas (handoff v2 §D « Tableau de bord », §E `Checklist`) : organisation ✓,
 * eBay, import, premier produit. Un statut n'est jamais porté par la seule couleur (icône + mot) ;
 * une étape à l'état inconnu affiche « — » et n'entre pas dans l'avancement.
 */
export function Checklist({ items, title = "Premiers pas" }: { items: readonly ChecklistItem[]; title?: string }) {
  const { done, known } = checklistProgress(items);
  const pct = known === 0 ? 0 : Math.round((done / known) * 100);
  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <MonoTitle title={title} aside={known > 0 ? `${done} / ${known}` : undefined} />
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="px-4 pb-3 pt-4">
          <div role="progressbar" aria-label={`Premiers pas : ${done} étape${done > 1 ? "s" : ""} faite${done > 1 ? "s" : ""} sur ${known}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-track">
            <div className="ms-grow-x h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <ol className="divide-y divide-line-soft border-t border-line-soft">
          {items.map((item, i) => {
            const body = (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
                    item.state === "done" && "bg-success-strong text-on-success-strong",
                    item.state === "todo" && "border border-border-strong text-muted",
                    item.state === "unknown" && "border border-dashed border-border-strong text-ink-3",
                  )}
                >
                  {item.state === "done" ? <Check className="h-4 w-4" strokeWidth={2.8} /> : item.state === "unknown" ? <Minus className="h-4 w-4" /> : i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className={cn("text-[15px] font-semibold leading-5", item.state === "done" ? "text-muted" : "text-foreground")}>{item.title}</span>
                  <span className="truncate text-[12.5px] font-semibold leading-[17px] text-ink-3">{item.detail}</span>
                </span>
                <span className={cn("ms-mono shrink-0 text-[10px] leading-[13px] tracking-[0.08em]", item.state === "done" ? "text-success" : "text-ink-3")}>{STATE_TEXT[item.state]}</span>
                {item.state !== "done" && item.href ? <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-4" /> : null}
              </>
            );
            return (
              <li key={item.key}>
                {item.state !== "done" && item.href ? (
                  <Link href={internalRoute(item.href)} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5 text-foreground transition-colors hover:bg-surface-2">
                    {body}
                  </Link>
                ) : (
                  <div className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
