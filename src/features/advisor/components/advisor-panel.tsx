"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Maximize2, RotateCw, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadAdvisorPanelAction, type AdvisorPanelData } from "@/features/advisor/actions";
import { rememberedConversation } from "@/features/advisor/remember";
import { AdvisorChat, AdvisorNotConfigured, AdvisorQuota, AdvisorStatusUnavailable, AdvisorUsageProvider } from "@/features/advisor/components/advisor-chat";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2 focus-visible:ring-offset-night";

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: AdvisorPanelData };

/**
 * Panneau Conseiller ⌘J (v5) : 460 px à droite, depuis toute page. Reprend la conversation en
 * cours de l'onglet (celle de la page /advisor), avec le même composant de conversation, l'état
 * réel du serveur et le quota. Fermeture : bouton ou Échap ; « Ouvrir la page » ouvre /advisor
 * sur la même conversation. Monté et démonté par la coquille (le démontage = fermeture).
 */
export function AdvisorPanel({ onClose }: { onClose: () => void }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [conversationId, setConversationId] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  const [attempt, setAttempt] = useState(0);

  // Chargement (et nouvelle tentative) : l'état passe à « prêt » ou « erreur » à la réponse du serveur.
  useEffect(() => {
    let alive = true;
    loadAdvisorPanelAction(rememberedConversation()).then(
      (r) => {
        if (!alive) return;
        if (r.ok) {
          setConversationId(r.data.conversationId);
          setLoad({ state: "ready", data: r.data });
        } else setLoad({ state: "error", message: r.error });
      },
      () => {
        if (alive) setLoad({ state: "error", message: "Le serveur MON STOCK est injoignable. Vérifiez votre connexion et réessayez." });
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  // Échap ferme le panneau ; le focus revient où il était à la fermeture.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  // Focus dans le panneau dès que la conversation est prête (champ de saisie).
  useEffect(() => {
    if (load.state !== "ready") return;
    const el = panelRef.current?.querySelector<HTMLTextAreaElement>("textarea:not([disabled])");
    (el ?? panelRef.current?.querySelector<HTMLElement>("button"))?.focus();
  }, [load.state]);

  const data = load.state === "ready" ? load.data : null;
  const pageHref = conversationId ? `/advisor?conversation=${conversationId}` : "/advisor";

  const header = (
    <div className="flex shrink-0 items-center gap-2.5 bg-night px-4 py-3">
      <Sparkles aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-mint" />
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 id="advisor-panel-title" className="text-[15px] font-bold leading-5 text-on-night">
          Conseiller
        </h2>
        {data ? <AdvisorQuota variant="panel" /> : <span className="ms-code text-[10px] leading-[13px] text-on-night-muted">{load.state === "loading" ? "Chargement…" : "Quota : —"}</span>}
      </div>
      <Link href={pageHref as never} onClick={() => onClose()} title="Ouvrir la page" aria-label="Ouvrir la page du conseiller" className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-night-raised text-on-night hover:bg-night-hover", FOCUS)}>
        <Maximize2 aria-hidden="true" className="h-4 w-4" />
      </Link>
      <button type="button" onClick={() => onClose()} aria-label="Fermer le conseiller (Échap)" title="Fermer (Échap)" className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-night-raised text-on-night hover:bg-night-hover", FOCUS)}>
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-labelledby="advisor-panel-title"
      className="ms-slide fixed inset-y-0 right-0 z-[85] flex w-[460px] max-w-full flex-col bg-background shadow-modal"
    >
      {data ? (
        <AdvisorUsageProvider initialUsed={data.usedThisHour} limit={data.perUserPerHour}>
          {header}
          <AdvisorChat
            variant="panel"
            organizationName={data.organizationName}
            initialConversationId={data.conversationId}
            initialItems={data.items}
            configured={data.configured}
            canConfirm={data.canConfirm}
            perUserPerHour={data.perUserPerHour}
            usedThisHour={data.usedThisHour}
            onConversationChange={setConversationId}
            notices={
              <>
                {data.configured === false ? <AdvisorNotConfigured /> : null}
                {data.statusError ? <AdvisorStatusUnavailable message={data.statusError} /> : null}
              </>
            }
          />
        </AdvisorUsageProvider>
      ) : (
        <>
          {header}
          <div className="flex flex-1 flex-col gap-3 p-4">
            {load.state === "loading" ? (
              <div role="status" className="flex items-center gap-2.5 self-start rounded-2xl bg-line-soft px-3 py-2.5 text-sm font-semibold text-muted">
                <span aria-hidden="true" className="ms-pulse h-2 w-2 rounded-full bg-foreground" />
                Ouverture du conseiller…
              </div>
            ) : (
              <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-danger-line bg-danger-soft px-4 py-3 text-[13.5px] font-semibold text-danger">
                <p>
                  <span className="font-bold">Conseiller indisponible.</span> {load.state === "error" ? load.message : null}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setLoad({ state: "loading" });
                    setAttempt((a) => a + 1);
                  }}
                  className="flex min-h-10 items-center justify-center gap-2 self-start rounded-[10px] border border-border-strong bg-surface px-3 text-sm font-extrabold text-foreground hover:bg-line-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RotateCw aria-hidden="true" className="h-4 w-4" /> Réessayer
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
