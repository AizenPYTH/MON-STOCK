"use client";
import { useSyncExternalStore } from "react";

/** Colonnes masquables du tableau de stock (le produit reste toujours affiché). */
export const STOCK_COLUMNS = [
  { key: "category", label: "Catégorie" },
  { key: "qty", label: "Quantité" },
  { key: "cover", label: "Couverture" },
  { key: "sales", label: "Ventes 30 j" },
  { key: "cost", label: "Coût" },
  { key: "price", label: "Prix" },
  { key: "margin", label: "Marge" },
  { key: "channel", label: "Canal" },
  { key: "level", label: "Niveau" },
] as const;
export type StockColumn = (typeof STOCK_COLUMNS)[number]["key"];

const KEY = "monstock.stock.hiddenColumns";
const EVENT = "monstock:stock-columns";
const EMPTY = "";
/** Repli en mémoire quand le stockage du navigateur est indisponible. */
let memory = EMPTY;

/** Préférence d'affichage propre à ce navigateur (aucune donnée métier) ; illisible → tout affiché. */
function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useHiddenColumns(): Set<StockColumn> {
  const raw = useSyncExternalStore(subscribe, read, () => EMPTY);
  const keys = STOCK_COLUMNS.map((c) => c.key) as readonly string[];
  return new Set(raw.split(",").filter((k): k is StockColumn => keys.includes(k)));
}

export function toggleColumn(key: StockColumn, hidden: Set<StockColumn>) {
  const next = new Set(hidden);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  memory = Array.from(next).join(",");
  try {
    window.localStorage.setItem(KEY, memory);
  } catch {
    // stockage indisponible (navigation privée…) : préférence gardée en mémoire pour cette page
  }
  window.dispatchEvent(new Event(EVENT));
}
