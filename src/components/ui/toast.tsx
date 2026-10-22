"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; tone: ToastTone; message: string };
type ToastApi = { success: (message: string) => void; error: (message: string) => void; info: (message: string) => void };

const NOOP: ToastApi = { success: () => {}, error: () => {}, info: () => {} };
const ToastContext = createContext<ToastApi>(NOOP);

/** Les erreurs restent plus longtemps : le temps de les lire. */
const DURATION_MS: Record<ToastTone, number> = { success: 5000, info: 5000, error: 8000 };

const TONE: Record<ToastTone, { icon: typeof CircleCheck; cls: string }> = {
  success: { icon: CircleCheck, cls: "text-success-ink" },
  error: { icon: TriangleAlert, cls: "text-danger-ink" },
  info: { icon: Info, cls: "text-info-ink" },
};

/**
 * Confirmations éphémères (« Mouvement enregistré », « Erreur réseau »…) pour les actions
 * dont le résultat n'est pas visible à l'endroit du clic (dialogue refermé, redirection…).
 * N'annoncer un succès qu'APRÈS la réponse du serveur. Les messages sont annoncés via une
 * région `aria-live` ; les erreurs restent préférablement affichées en ligne dans le formulaire (FormError).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-2), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), DURATION_MS[tone]);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(() => ({ success: (m) => push("success", m), error: (m) => push("error", m), info: (m) => push("info", m) }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-6 sm:w-96">
        {items.map((t) => {
          const { icon: Icon, cls } = TONE[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className="ms-pop pointer-events-auto flex items-start gap-3 rounded-2xl border border-border bg-surface py-3 pl-4 pr-3 text-sm font-semibold text-foreground shadow-floating"
            >
              <Icon aria-hidden="true" className={cn("mt-0.5 h-4 w-4 shrink-0", cls)} />
              <span className="min-w-0 flex-1 break-words">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Fermer la notification"
                className="-my-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-line-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:h-10 pointer-coarse:w-10"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/** API de notification ; sans `ToastProvider` (pages publiques), les appels sont ignorés. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}
