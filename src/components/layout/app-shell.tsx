"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children, topbar, counts }: { children: ReactNode; topbar: ReactNode; counts?: Partial<Record<string, number>> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface lg:block">
        <div className="sticky top-0 h-screen overflow-y-auto">
          <div className="flex h-14 items-center border-b border-border px-5">
            <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
              MON STOCK
            </Link>
          </div>
          <Sidebar counts={counts} />
        </div>
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-surface shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="text-sm font-semibold">MON STOCK</span>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted hover:bg-surface-muted" aria-label="Fermer le menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            <Sidebar counts={counts} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setOpen(true)} className="rounded-md p-1.5 text-muted hover:bg-surface-muted lg:hidden" aria-label="Ouvrir le menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">{topbar}</div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
