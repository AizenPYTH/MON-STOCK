"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error";
type ToastItem = { id: number; tone: ToastTone; message: string };
type ToastApi = { success: (message: string) => void; error: (message: string) => void };

const NOOP: ToastApi = { success: () => {}, error: () => {} };
const ToastContext = createContext<ToastApi>(NOOP);

const DURATION_MS = 5000;

/**
 * Confirmations éphémères (« Mouvement enregistré », « Erreur réseau »…) pour les actions
 * dont le résultat n'est pas visible à l'endroit du clic (dialogue refermé, redirection…).
 * Les messages sont annoncés via une région `aria-live` ; les erreurs restent préférablement
 * affichées en ligne dans le formulaire (FormError).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-2), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(() => ({ success: (m) => push("success", m), error: (m) => push("error", m) }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-6 sm:w-96">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-surface px-4 py-3 text-sm shadow-lg",
              t.tone === "error" ? "border-red-200 text-red-800" : "border-green-200 text-green-800",
            )}
          >
            {t.tone === "error" ? <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
            <span className="min-w-0 flex-1 break-words">{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Fermer la notification" className="-m-1 rounded-md p-1 text-muted hover:bg-surface-muted hover:text-foreground">
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** API de notification ; sans `ToastProvider` (pages publiques), les appels sont ignorés. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}
