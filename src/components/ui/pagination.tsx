import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { internalRoute } from "@/lib/routes";

/** Pagination par liens (URL) : plage affichée, page courante, précédent / suivant. */
export function Pagination({ page, pageSize, total, makeHref, className }: { page: number; pageSize: number; total: number; makeHref: (page: number) => string; className?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pageLink = (target: number, label: string, disabled: boolean, dir: "prev" | "next") => {
    const content =
      dir === "prev" ? (
        <>
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          <span className="max-sm:sr-only">{label}</span>
        </>
      ) : (
        <>
          <span className="max-sm:sr-only">{label}</span>
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </>
      );
    return disabled ? (
      // Page inexistante : pas de lien focalisable menant nulle part.
      <span aria-disabled="true" className={cn(buttonClasses("secondary", "sm"), "max-sm:w-10 max-sm:px-0 pointer-events-none opacity-50")}>
        {content}
      </span>
    ) : (
      <Link href={internalRoute(makeHref(target))} className={cn(buttonClasses("secondary", "sm"), "max-sm:w-10 max-sm:px-0")} rel={dir} aria-label={label}>
        {content}
      </Link>
    );
  };
  return (
    <nav aria-label="Pagination" className={cn("flex flex-wrap items-center justify-between gap-3 text-sm text-muted", className)}>
      <span className="tnum">
        <span className="font-semibold text-foreground">
          {formatNumber(from)}–{formatNumber(to)}
        </span>{" "}
        sur {formatNumber(total)}
      </span>
      <div className="flex items-center gap-2">
        {pageLink(Math.max(1, page - 1), "Précédent", page <= 1, "prev")}
        <span className="min-w-14 text-center tnum" aria-current="page">
          <span className="sr-only">Page </span>
          {page} / {pages}
        </span>
        {pageLink(Math.min(pages, page + 1), "Suivant", page >= pages, "next")}
      </div>
    </nav>
  );
}
