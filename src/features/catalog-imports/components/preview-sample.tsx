import type { CatalogPreviewDTO } from "@/features/mobile-api/contract";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney, formatNumber } from "@/lib/format";

/** Premières lignes converties (aperçu : rien n'est enregistré). Prix inconnu → « — », jamais 0. */
export function PreviewSample({ sample, limit = 20 }: { sample: CatalogPreviewDTO["sample"]; limit?: number }) {
  return (
    <Table className="min-w-[960px]">
      <caption className="sr-only">Aperçu des premières lignes du fichier</caption>
      <THead>
        <tr>
          <TH scope="col">Ligne</TH>
          <TH scope="col">Désignation</TH>
          <TH scope="col">Référence</TH>
          <TH scope="col">EAN</TH>
          <TH scope="col" align="right">
            Prix
          </TH>
          <TH scope="col" align="right">
            Stock
          </TH>
          <TH scope="col">État / grade</TH>
          <TH scope="col" align="right">
            MOQ
          </TH>
          <TH scope="col">Contrôles</TH>
        </tr>
      </THead>
      <TBody>
        {sample.slice(0, limit).map((s) => (
          <TR key={s.line} className={s.errors.length ? "bg-danger-soft/40" : undefined}>
            <TD className="font-mono text-xs text-muted">L{s.line}</TD>
            <TD className="max-w-[320px]">
              <span className="line-clamp-2">{s.title ?? "—"}</span>
            </TD>
            <TD className="font-mono text-xs">{s.reference ?? "—"}</TD>
            <TD className="font-mono text-xs">{s.ean ?? "—"}</TD>
            <TD align="right">
              {s.price !== null && s.currency ? formatMoney(s.price, s.currency) : "—"}
              {s.price !== null ? <span className="ml-1 text-xs text-muted">{s.taxType === "ht" ? "HT" : s.taxType === "ttc" ? "TTC" : "HT/TTC ?"}</span> : null}
            </TD>
            <TD align="right">{s.quantity !== null ? formatNumber(s.quantity) : <span className="text-xs text-muted">non indiqué</span>}</TD>
            <TD className="text-xs">{[s.condition, s.grade ? `grade ${s.grade}` : null].filter(Boolean).join(" · ") || "—"}</TD>
            <TD align="right">{s.moq !== null ? formatNumber(s.moq) : "—"}</TD>
            <TD className="max-w-[280px] text-xs">
              {s.errors.length ? <span className="text-danger">{s.errors.join(" ")}</span> : <span className="text-success">Exploitable</span>}
              {s.warnings.length ? <div className="text-amber-700">{s.warnings.join(" ")}</div> : null}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
