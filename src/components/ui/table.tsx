import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type TableDensity = "comfortable" | "compact";

/**
 * Tableau dense « Instrument ».
 * - `density` : confortable (défaut, 48 px par ligne) ou compacte (40 px) ;
 * - `stickyHeader` : en-tête collant dans une zone défilante (true = 70vh, ou une hauteur CSS) ;
 * - `stackOnMobile` : sous 640 px, chaque ligne devient une carte ; donner `label` aux <TD>
 *   (intitulé affiché) et `primary` à la cellule titre ;
 * - chiffres : `<TH align="right">` + `<TD align="right">` (ou `numeric`) → alignés à droite, tabulaires.
 * La largeur minimale par défaut (640 px) est remplacée par toute classe `min-w-*` passée en `className`.
 */
export function Table({
  className,
  density = "comfortable",
  stickyHeader = false,
  stackOnMobile = false,
  wrapperClassName,
  caption,
  children,
  ...props
}: HTMLAttributes<HTMLTableElement> & { density?: TableDensity; stickyHeader?: boolean | string; stackOnMobile?: boolean; wrapperClassName?: string; caption?: ReactNode }) {
  const hasMinWidth = typeof className === "string" && /(^|\s)min-w-/.test(className);
  return (
    <div className={cn("table-wrap", stickyHeader && "overflow-y-auto overscroll-contain", wrapperClassName)} style={stickyHeader ? { maxHeight: typeof stickyHeader === "string" ? stickyHeader : "70vh" } : undefined}>
      <table
        data-density={density}
        data-sticky={stickyHeader ? "true" : undefined}
        className={cn("group/table w-full border-collapse text-sm", !hasMinWidth && "min-w-[640px]", stackOnMobile && "ms-table-stack", className)}
        {...props}
      >
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("ms-mono text-[10.5px] leading-[14px] text-ink-3", className)} {...props} />;
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-line-soft", className)} {...props} />;
}

/** Ligne : survol discret ; `aria-selected` (ou `data-selected`) → fond de sélection. */
export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors duration-150 ease-standard hover:bg-surface-2 aria-selected:bg-selection data-[selected=true]:bg-selection", className)} {...props} />;
}

type Align = "left" | "right" | "center";
const alignClass = (align: Align | undefined) => (align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left");

export function TH({ className, align, numeric = false, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { align?: Align; numeric?: boolean }) {
  return (
    <th
      className={cn(
        "h-10 whitespace-nowrap bg-surface-2 px-3 font-medium shadow-[inset_0_-1px_0_var(--border)] first:pl-4 last:pr-4 group-data-[density=compact]/table:h-9",
        "group-data-[sticky=true]/table:sticky group-data-[sticky=true]/table:top-0 group-data-[sticky=true]/table:z-10",
        alignClass(numeric ? "right" : align),
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  align,
  numeric = false,
  label,
  primary = false,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { align?: Align; numeric?: boolean; /** Intitulé affiché en vue cartes (stackOnMobile). */ label?: string; /** Cellule titre de la carte (stackOnMobile). */ primary?: boolean }) {
  const a = numeric ? "right" : align;
  return (
    <td
      data-label={label}
      data-primary={primary || undefined}
      className={cn("px-3 py-3 align-middle first:pl-4 last:pr-4 group-data-[density=compact]/table:py-2", alignClass(a), a === "right" && "tnum whitespace-nowrap", className)}
      {...props}
    />
  );
}
