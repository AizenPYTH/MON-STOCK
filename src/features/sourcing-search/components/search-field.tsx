"use client";
import { useRef, useState } from "react";
import Form from "next/form";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MIN_QUERY_LENGTH } from "@/features/sourcing-search/display";

/**
 * Champ de recherche de la scène (blanc, 56 px) : « Chercher » dès 2 caractères, « × » pour effacer
 * une recherche affichée. Envoi GET /sourcing?q=… (navigation côté client).
 */
export function SearchField({ query }: { query: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(query);
  const ready = draft.trim().length >= MIN_QUERY_LENGTH;
  const canClear = query.length > 0 && draft === query;
  return (
    <Form action="/sourcing" role="search" aria-label="Rechercher chez les fournisseurs" className="flex h-14 w-full max-w-[760px] items-center gap-2 rounded-[14px] bg-surface pl-3.5 pr-1.5 text-foreground focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
      <Search aria-hidden="true" className="h-[19px] w-[19px] shrink-0" strokeWidth={2} />
      <label htmlFor="supplier-q" className="sr-only">
        Produit recherché
      </label>
      <input
        ref={input}
        id="supplier-q"
        name="q"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Ex. iPhone 13, écran, batterie…"
        minLength={MIN_QUERY_LENGTH}
        maxLength={120}
        required
        autoComplete="off"
        autoFocus={!query}
        className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold text-foreground outline-none placeholder:font-medium placeholder:text-ink-3 focus-visible:outline-none"
      />
      {canClear ? (
        <button
          type="button"
          aria-label="Effacer la recherche"
          onClick={() => {
            setDraft("");
            router.push("/sourcing");
            input.current?.focus();
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background hover:bg-line-soft"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      ) : (
        <button type="submit" disabled={!ready} className={cn("h-[42px] min-w-24 shrink-0 rounded-[10px] px-3.5 text-[15px] font-extrabold transition-colors", ready ? "bg-mint text-night hover:bg-mint-pressed" : "bg-track text-ink-3")}>
          Chercher
        </button>
      )}
    </Form>
  );
}
