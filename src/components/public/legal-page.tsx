import type { ReactNode } from "react";
import { LEGAL, TO_COMPLETE } from "@/content/legal";

/**
 * Gabarit des pages légales (style v5) : scène nuit avec date de mise à jour et titre, puis
 * papier qui remonte de 24 px et porte le texte dans une carte blanche. Contenu inchangé.
 */
export function LegalPage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <>
      <section className="bg-night text-on-night">
        <div className="mx-auto w-full max-w-[880px] px-4 pb-14 pt-8 sm:px-6 sm:pt-12 lg:px-12">
          <p className="ms-mono text-[11px] leading-[14px] tracking-[0.07em] text-on-night-muted">Mise à jour : {new Date(LEGAL.lastUpdated).toLocaleDateString("fr-FR", { dateStyle: "long" })}</p>
          <h1 className="mt-2 text-[30px] font-extrabold leading-9 tracking-[-0.8px] text-on-night sm:text-[36px] sm:leading-[42px]">{title}</h1>
          {intro ? <p className="mt-3 max-w-[680px] text-base font-medium leading-6 text-on-night-muted">{intro}</p> : null}
        </div>
      </section>
      <div className="-mt-6 rounded-t-3xl bg-background">
        <div className="mx-auto w-full max-w-[880px] px-4 pb-16 pt-8 sm:px-6 lg:px-12">
          <article className="legal max-w-none space-y-9 rounded-3xl border border-border bg-surface p-5 text-[15px] font-medium leading-7 text-muted-strong sm:p-10 [&_a]:underline-offset-4 [&_strong]:font-bold [&_strong]:text-foreground">{children}</article>
        </div>
      </div>
    </>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 [&+&]:border-t [&+&]:border-line-soft [&+&]:pt-8">
      <h2 className="text-[19px] font-extrabold leading-[26px] tracking-[-0.3px] text-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** Valeur fournie par l'éditeur, ou mention visible « à compléter » (jamais inventée). */
export function Fact({ value }: { value: string | null }) {
  return value ? <>{value}</> : <span className="whitespace-nowrap rounded-md bg-warning-soft px-1.5 py-0.5 text-[0.92em] font-semibold text-warning-ink ring-1 ring-inset ring-warning-line">{TO_COMPLETE}</span>;
}

export function ContactLine() {
  return LEGAL.contactEmail ? (
    <a className="font-bold text-interactive underline underline-offset-4 hover:text-interactive-hover" href={`mailto:${LEGAL.contactEmail}`}>
      {LEGAL.contactEmail}
    </a>
  ) : (
    <Fact value={null} />
  );
}
