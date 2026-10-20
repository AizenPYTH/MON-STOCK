import type { ReactNode } from "react";
import { LEGAL, TO_COMPLETE } from "@/content/legal";

/** Gabarit typographique des pages légales. */
export function LegalPage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Mise à jour : {new Date(LEGAL.lastUpdated).toLocaleDateString("fr-FR", { dateStyle: "long" })}</p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
      {intro ? <p className="mt-4 text-base text-muted">{intro}</p> : null}
      <div className="legal mt-8 space-y-8 text-[15px] leading-7">{children}</div>
    </article>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** Valeur fournie par l'éditeur, ou mention visible « à compléter » (jamais inventée). */
export function Fact({ value }: { value: string | null }) {
  return value ? <>{value}</> : <span className="rounded bg-warning-soft px-1.5 py-0.5 text-warning">{TO_COMPLETE}</span>;
}

export function ContactLine() {
  return LEGAL.contactEmail ? (
    <a className="font-semibold underline" href={`mailto:${LEGAL.contactEmail}`}>
      {LEGAL.contactEmail}
    </a>
  ) : (
    <Fact value={null} />
  );
}
