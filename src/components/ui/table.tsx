import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="table-wrap">
      <table className={cn("w-full min-w-[640px] border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-surface-muted/60 text-xs uppercase tracking-wide text-muted", className)} {...props} />;
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-border", className)} {...props} />;
}

export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("hover:bg-surface-muted/50", className)} {...props} />;
}

export function TH({ className, align, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  return <th className={cn("px-3 py-2.5 font-medium first:pl-4 last:pr-4", align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left", className)} {...props} />;
}

export function TD({ className, align, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  return <td className={cn("px-3 py-2.5 align-middle first:pl-4 last:pr-4", align === "right" ? "text-right tnum" : align === "center" ? "text-center" : "text-left", className)} {...props} />;
}
