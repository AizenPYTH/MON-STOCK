import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";

export function Pagination({ page, pageSize, total, makeHref }: { page: number; pageSize: number; total: number; makeHref: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted">
      <span>
        {from}–{to} sur {total}
      </span>
      <div className="flex items-center gap-2">
        <Link aria-disabled={page <= 1} href={makeHref(Math.max(1, page - 1)) as never} className={cn(buttonClasses("secondary", "sm"), page <= 1 && "pointer-events-none opacity-50")}>
          Précédent
        </Link>
        <span className="tnum">
          {page} / {pages}
        </span>
        <Link aria-disabled={page >= pages} href={makeHref(Math.min(pages, page + 1)) as never} className={cn(buttonClasses("secondary", "sm"), page >= pages && "pointer-events-none opacity-50")}>
          Suivant
        </Link>
      </div>
    </div>
  );
}
