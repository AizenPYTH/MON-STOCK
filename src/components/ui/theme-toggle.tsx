"use client";
import { useCallback, useId, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME_COOKIE, THEME_STORAGE_KEY, type ThemePreference } from "@/components/ui/theme-script";

export type { ThemePreference } from "@/components/ui/theme-script";

const EVENT = "ms-theme-change";
const OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "system", label: "Système", icon: Monitor },
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
];

function isPreference(v: unknown): v is "light" | "dark" {
  return v === "light" || v === "dark";
}

/** Préférence enregistrée (localStorage, sinon cookie) ; « system » par défaut ou si le stockage est bloqué. */
export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isPreference(stored)) return stored;
  } catch {
    // Stockage bloqué (navigation privée, cookies tiers…) : on tente le cookie.
  }
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=(light|dark)(?:;|$)`));
    if (m && isPreference(m[1])) return m[1];
  } catch {
    // Cookie illisible : préférence système.
  }
  return "system";
}

/** Applique et mémorise la préférence (sans erreur si le stockage est indisponible). */
export function setThemePreference(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  try {
    if (pref === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Stockage indisponible : le cookie prend le relais.
  }
  try {
    document.cookie = pref === "system" ? `${THEME_COOKIE}=; path=/; max-age=0; SameSite=Lax` : `${THEME_COOKIE}=${pref}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // Cookies bloqués : le choix vaut pour cette page seulement.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    // Autre onglet : on réaligne l'attribut de ce document.
    const pref = readThemePreference();
    if (pref === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", pref);
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Préférence de thème courante, synchronisée entre composants et onglets. */
export function useThemePreference(): [ThemePreference, (pref: ThemePreference) => void] {
  const pref = useSyncExternalStore(subscribe, readThemePreference, () => "system" as ThemePreference);
  const set = useCallback((p: ThemePreference) => setThemePreference(p), []);
  return [pref, set];
}

/**
 * Sélecteur de thème : `segmented` (Système / Clair / Sombre, boutons radio natifs, clavier complet)
 * ou `icon` (un bouton qui fait défiler les trois choix). `onNight` pour la navigation bleu nuit.
 */
export function ThemeToggle({ variant = "segmented", onNight = false, className }: { variant?: "segmented" | "icon"; onNight?: boolean; className?: string }) {
  const [pref, setPref] = useThemePreference();
  const groupName = useId();

  if (variant === "icon") {
    const index = OPTIONS.findIndex((o) => o.value === pref);
    const current = OPTIONS[index] ?? OPTIONS[0]!;
    const next = OPTIONS[(index + 1) % OPTIONS.length]!;
    const Icon = current.icon;
    return (
      <button
        type="button"
        onClick={() => setPref(next.value)}
        aria-label={`Thème : ${current.label}. Passer à : ${next.label}`}
        title={`Thème : ${current.label}`}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors duration-150 ease-standard focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:h-10 pointer-coarse:w-10",
          onNight ? "text-on-night-muted hover:bg-night-raised hover:text-on-night" : "text-muted hover:bg-line-soft hover:text-foreground",
          className,
        )}
      >
        <Icon aria-hidden="true" className="h-4 w-4" />
      </button>
    );
  }

  return (
    <fieldset className={cn("inline-flex rounded-xl p-[3px]", onNight ? "bg-night-raised" : "bg-track", className)}>
      <legend className="sr-only">Thème d'affichage</legend>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const checked = pref === value;
        return (
          <label
            key={value}
            className={cn(
              "relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-semibold transition-colors duration-150 ease-standard has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ring pointer-coarse:h-10",
              checked
                ? onNight
                  ? "bg-night-hover text-on-night"
                  : "bg-surface text-foreground shadow-raised"
                : onNight
                  ? "text-on-night-muted hover:text-on-night"
                  : "text-muted hover:text-foreground",
            )}
          >
            <input type="radio" name={groupName} value={value} checked={checked} onChange={() => setPref(value)} className="sr-only" />
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            <span>{label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
