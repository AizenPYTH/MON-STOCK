import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";

export function Pagination({ page, pageSize, total, makeHref }: { page: number; pageSize: number; total: number; makeHref: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pageLink = (target: number, label: string, disabled: boolean) =>
    disabled ? (
      // Page inexistante : pas de lien focalisable menant nulle part.
      <span aria-disabled="true" className={cn(buttonClasses("secondary", "sm"), "pointer-events-none opacity-50")}>
        {label}
      </span>
    ) : (
      <Link href={makeHref(target) as never} className={buttonClasses("secondary", "sm")} rel={target < page ? "prev" : "next"}>
        {label}
      </Link>
    );
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <span className="tnum">
        {formatNumber(from)}–{formatNumber(to)} sur {formatNumber(total)}
      </span>
      <div className="flex items-center gap-2">
        {pageLink(Math.max(1, page - 1), "Précédent", page <= 1)}
        <span className="tnum" aria-current="page">
          {page} / {pages}
        </span>
        {pageLink(Math.min(pages, page + 1), "Suivant", page >= pages)}
      </div>
    </nav>
  );
}
