import type { CatalogPreviewDTO } from "@/features/mobile-api/contract";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Premières lignes converties par le serveur (aperçu : rien n'est enregistré). Ligne en erreur
 * sur fond rouge pâle avec la raison, avertissement en ambre. Prix inconnu → « — », jamais 0.
 */
export function PreviewSample({ sample, limit = 6, caption = "Aperçu des premières lignes du fichier" }: { sample: CatalogPreviewDTO["sample"]; limit?: number; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[500px] table-fixed border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col className="w-[52px]" />
          <col />
          <col className="w-[120px]" />
          <col className="w-[60px]" />
          <col className="w-[52px]" />
        </colgroup>
        <thead className="ms-mono bg-[#F7F8FA] text-[10px] leading-[13px] text-ink-3">
          <tr className="border-b border-line-soft">
            <th scope="col" className="py-2 pl-3 font-medium">
              Ligne
            </th>
            <th scope="col" className="px-2 py-2 font-medium">
              Désignation
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Prix
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Stock
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              MOQ
            </th>
          </tr>
        </thead>
        <tbody>
          {sample.slice(0, limit).map((s, i) => {
            const meta = [s.reference, `EAN ${s.ean ?? "—"}`, s.condition, `grade ${s.grade ?? "—"}`].filter(Boolean).join(" · ");
            return (
              <tr key={s.line} className={cn("align-baseline", i > 0 && "border-t border-line-soft", s.errors.length > 0 && "bg-[#FDF5F5]")}>
                <td className="ms-code py-2.5 pl-3 text-[11px] text-ink-3">L{s.line}</td>
                <td className="min-w-0 px-2 py-2.5">
                  <span className="block truncate text-[13.5px] font-semibold leading-[18px]" title={s.title ?? undefined}>
                    {s.title ?? "—"}
                  </span>
                  <span className="ms-code block truncate text-[10px] leading-[14px] text-ink-3">{meta}</span>
                  {s.errors.length ? <span className="mt-1 block text-xs font-semibold leading-4 text-danger">{s.errors.join(" ")}</span> : null}
                  {s.warnings.length ? <span className="mt-1 block text-xs font-semibold leading-4 text-warning">{s.warnings.join(" ")}</span> : null}
                </td>
                <td className="whitespace-nowrap px-2 py-2.5 text-right text-[13px] font-bold tnum">
                  {s.price !== null && s.currency ? formatMoney(s.price, s.currency) : "—"}
                  {s.price !== null ? <span className="ml-1 text-[11px] font-semibold text-ink-3">{s.taxType === "ht" ? "HT" : s.taxType === "ttc" ? "TTC" : "HT/TTC ?"}</span> : null}
                </td>
                <td className="px-2 py-2.5 text-right text-[13px] font-semibold tnum">{s.quantity !== null ? formatNumber(s.quantity) : <span className="text-ink-3">—</span>}</td>
                <td className="py-2.5 pr-3 text-right text-[13px] font-semibold tnum">{s.moq !== null ? formatNumber(s.moq) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
