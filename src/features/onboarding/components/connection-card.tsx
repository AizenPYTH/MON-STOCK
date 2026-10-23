import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { Check, CircleAlert, Clock3, ShieldCheck, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative, formatTime } from "@/lib/format";
import { Callout } from "@/components/ui/callout";
import { ChannelStatus, type ChannelState } from "@/components/marketing/channel-status";
import motion from "@/components/auth-shell/parcours.module.css";
import { PENDING_STEPS, type EbayConnectionFact, type PlatformState } from "@/features/onboarding/platform-state";
import { ConnectEbayForm } from "@/features/onboarding/components/connect-ebay-form";

/** Ce que fait la connexion eBay AUJOURD'HUI (faits du dépôt, aucune promesse). */
const BENEFITS = [
  "Vos annonces actives sont lues et rapprochées de vos SKU (vous validez les associations).",
  "Chaque commande eBay est importée et déduit le stock une seule fois par ligne.",
  "Aucune quantité n'est envoyée vers eBay tant que vous ne l'activez pas.",
] as const;

const TITLES: Record<PlatformState["ebay"], string> = {
  none: "Connectez votre compte eBay",
  pending: "Connexion eBay en cours",
  success: "eBay est connecté",
  error: "La connexion n'a pas abouti",
  already: "eBay est déjà connecté",
  unavailable: "Connectez eBay depuis l'app iPhone",
};

function badgeFor(state: PlatformState): ChannelState {
  switch (state.ebay) {
    case "pending":
      return "running";
    case "success":
      return "connected";
    case "error":
      return "error";
    case "already":
      return state.connection?.status === "connected" ? "connected" : "error";
    case "unavailable":
      return "not_connected";
    default:
      return "available";
  }
}

const CONNECTION_STATUS_TEXT: Record<EbayConnectionFact["status"], string> = {
  connected: "Connecté",
  pending: "Autorisation à finaliser",
  expired: "Autorisation expirée : à reconnecter",
  error: "En erreur",
  disconnected: "Déconnecté",
};

/**
 * Carte eBay de l'étape « plateforme » (handoff v2 §D, §E `ConnectionCard`) : emplacement du logo
 * (nom en Manrope, `logoSrc` pour l'asset officiel), badge d'état, titre 34, bénéfices, action, mention
 * OAuth, schéma nuit « APRÈS AUTORISATION ». Tout ce qui est affiché vient de `PlatformState`
 * (connexion en base, attente OAuth réelle, configuration) : aucun compte, aucune date inventés.
 */
export function ConnectionCard({ state, logoSrc }: { state: PlatformState; logoSrc?: string }) {
  const c = state.connection;
  const showBenefits = state.ebay === "none" || state.ebay === "pending" || state.ebay === "error" || state.ebay === "unavailable";
  return (
    <article aria-labelledby="ebay-carte-titre" className="overflow-hidden rounded-[28px] border border-paper-marketing-line bg-surface">
      <div className="grid gap-0 min-[860px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-5 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-12 min-w-12 items-center justify-center rounded-[14px] border border-paper-marketing-line bg-paper-marketing px-3">
              {logoSrc ? <Image src={logoSrc} alt="eBay" width={64} height={24} unoptimized className="h-6 w-auto" /> : <span className="text-[17px] font-extrabold tracking-[-0.02em] text-foreground">eBay</span>}
            </span>
            <ChannelStatus state={badgeFor(state)} surface="paper" />
          </div>

          <div className="flex items-start gap-4">
            {state.ebay === "success" ? <SuccessMark /> : null}
            <h2 id="ebay-carte-titre" className={cn("text-[28px] font-extrabold leading-[1.08] tracking-[-0.035em] text-foreground sm:text-[34px]", state.ebay === "error" && motion.shake)}>
              {TITLES[state.ebay]}
            </h2>
          </div>

          <StateBody state={state} />

          {showBenefits ? (
            <ul className="grid gap-2.5">
              {BENEFITS.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-[14.5px] font-medium leading-[21px] text-muted-strong">
                  <Check aria-hidden="true" className="mt-[3px] h-4 w-4 shrink-0 text-success" strokeWidth={2.4} />
                  {b}
                </li>
              ))}
            </ul>
          ) : null}

          <Actions state={state} />
        </div>
        <AfterAuthorization lit={state.ebay === "success" || (state.ebay === "already" && c?.status === "connected")} />
      </div>
    </article>
  );
}

function SuccessMark() {
  return (
    <span aria-hidden="true" className={cn(motion.pop, "relative mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-success-strong text-on-success-strong")}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
      {/* « Tracé » : un cache de la couleur de la pastille se retire (scaleX), uniquement transform. */}
      <span className={cn(motion.trace, "absolute inset-y-2 left-2 right-2 bg-success-strong")} />
    </span>
  );
}

function AccountLines({ c }: { c: EbayConnectionFact }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 rounded-[16px] border border-paper-marketing-line bg-paper-marketing/60 px-4 py-3.5 sm:grid-cols-2">
      <div className="min-w-0">
        <dt className="ms-mono text-[10px] leading-[13px] tracking-[0.08em] text-ink-3">Compte eBay</dt>
        <dd className="mt-1 truncate text-[16px] font-bold text-foreground">{c.username ?? "Nom de compte non renvoyé par eBay"}</dd>
      </div>
      <div className="min-w-0">
        <dt className="ms-mono text-[10px] leading-[13px] tracking-[0.08em] text-ink-3">État</dt>
        <dd className="mt-1 text-[14px] font-semibold text-foreground">
          {CONNECTION_STATUS_TEXT[c.status]}
          {c.environment === "sandbox" ? " · Sandbox" : ""}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="ms-mono text-[10px] leading-[13px] tracking-[0.08em] text-ink-3">Connecté le</dt>
        <dd className="mt-1 text-[14px] font-semibold text-foreground tnum">{c.connectedAt ? formatDateTime(c.connectedAt) : "—"}</dd>
      </div>
      <div className="min-w-0">
        <dt className="ms-mono text-[10px] leading-[13px] tracking-[0.08em] text-ink-3">Dernière synchro réussie</dt>
        <dd className="mt-1 text-[14px] font-semibold text-foreground tnum">{c.lastSuccessfulSyncAt ? formatRelative(c.lastSuccessfulSyncAt) : "Pas encore"}</dd>
      </div>
    </dl>
  );
}

function StateBody({ state }: { state: PlatformState }) {
  const c = state.connection;
  const notes: ReactNode[] = [];
  if (state.readFailed) {
    notes.push(
      <Callout key="read" tone="warning" role="alert" title="État de la connexion indisponible">
        Vos connexions n&apos;ont pas pu être lues pour le moment : rien n&apos;est affirmé ici. Rechargez la page dans quelques instants.
      </Callout>,
    );
  }
  if (state.unconfirmedReturn && state.ebay !== "success") {
    notes.push(
      <Callout key="unconfirmed" tone="warning" title="Retour d'eBay non confirmé">
        Aucune connexion confirmée par le serveur ne correspond à ce retour : rien n&apos;a été enregistré. Relancez la connexion si besoin.
      </Callout>,
    );
  }

  let body: ReactNode = null;
  switch (state.ebay) {
    case "none":
      body = <p className="max-w-[560px] text-[16px] font-medium leading-6 text-muted">Le seul canal disponible aujourd&apos;hui. Vous autorisez MON STOCK chez eBay, puis un assistant lit vos annonces.</p>;
      break;
    case "pending":
      body = (
        <div className="flex flex-col gap-4">
          <div role="status" className="flex items-start gap-2.5 rounded-[14px] border border-info-line bg-info-soft px-3.5 py-3 text-sm font-semibold leading-5 text-info-ink">
            <Clock3 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              La connexion n&apos;est pas terminée tant que le serveur ne l&apos;a pas confirmée.
              {state.pendingSince ? ` Demande enregistrée à ${formatTime(state.pendingSince)}, valable 15 min.` : null} Si vous avez fermé la page d&apos;eBay, relancez la connexion.
            </span>
          </div>
          <ol className="grid gap-0 overflow-hidden rounded-[16px] border border-paper-marketing-line">
            {PENDING_STEPS.map((s, i) => {
              const status = i === 0 ? "done" : i === 1 ? "current" : "todo";
              return (
                <li key={s.key} aria-current={status === "current" ? "step" : undefined} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-paper-marketing-rule")}>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      status === "done" && "bg-success-strong text-on-success-strong",
                      status === "current" && "border-2 border-info-strong text-info-ink",
                      status === "todo" && "border border-paper-marketing-rule-strong text-ink-3",
                    )}
                  >
                    {status === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : status === "current" ? <span className={cn(motion.breathe, "block h-2 w-2 rounded-full bg-info-strong")} /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[14.5px] font-bold leading-5", status === "todo" ? "text-muted" : "text-foreground")}>{s.label}</span>
                    <span className="block text-[12.5px] font-semibold leading-[17px] text-ink-3">{s.detail}</span>
                  </span>
                  <span className="ms-mono shrink-0 text-[10px] leading-[13px] tracking-[0.08em] text-ink-3">{status === "done" ? "Fait" : status === "current" ? "En attente" : "À venir"}</span>
                </li>
              );
            })}
          </ol>
        </div>
      );
      break;
    case "success":
      body = (
        <div role="status" className="flex flex-col gap-4">
          <p className="max-w-[560px] text-[16px] font-medium leading-6 text-muted">Connexion confirmée et enregistrée par le serveur. Prochaine étape : l&apos;assistant analyse vos annonces et vous propose les associations avec vos SKU.</p>
          {c ? <AccountLines c={c} /> : null}
        </div>
      );
      break;
    case "error":
      body = (
        <div role="alert" className={cn(motion.shake, "flex items-start gap-2.5 rounded-[14px] border border-danger-line bg-danger-soft px-3.5 py-3 text-sm font-semibold leading-5 text-danger-ink")}>
          <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">
            {state.error?.message}
            {state.error?.code ? (
              <span className="mt-1.5 block">
                <span className="ms-mono text-[10.5px] leading-[14px] tracking-[0.08em] text-danger-ink/80">Code · </span>
                <code className="ms-code rounded bg-surface/70 px-1.5 py-0.5 text-[12px] text-danger-ink">{state.error.code}</code>
              </span>
            ) : null}
          </span>
        </div>
      );
      break;
    case "already":
      body = (
        <div className="flex flex-col gap-4">
          <p className="max-w-[560px] text-[16px] font-medium leading-6 text-muted">Un compte eBay est relié à cette organisation. Il n&apos;y a rien à reconnecter ici : la connexion se gère dans les intégrations.</p>
          {c ? <AccountLines c={c} /> : null}
        </div>
      );
      break;
    case "unavailable":
      body =
        state.block === "web_runame_missing" ? (
          <Callout tone="info" icon={<Smartphone />} title="Connexion depuis le site non activée sur ce serveur">
            <p>Ouvrez l&apos;app iPhone MON STOCK : Intégration eBay → « Connecter mon compte eBay ». La connexion apparaîtra ensuite ici, avec le même compte.</p>
            {state.admin ? <p className="mt-1 text-xs">Pour l&apos;activer sur le site : RuName web (variable <code className="ms-code">EBAY_WEB_RU_NAME</code>, voir <code className="ms-code">docs/ebay-setup.md</code>).</p> : null}
          </Callout>
        ) : (
          <Callout tone="warning" title="Intégration eBay non configurée sur ce serveur">
            Les identifiants de l&apos;application eBay ne sont pas renseignés : aucune connexion n&apos;est possible pour le moment.
          </Callout>
        );
      break;
  }
  return (
    <>
      {notes}
      {body}
    </>
  );
}

const linkPrimary = "inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[14px] bg-mint px-6 text-base font-extrabold text-night transition-[background-color,transform] duration-300 ease-instrument hover:bg-mint-pressed pointer-fine:hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const linkSecondary = "inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[14px] border border-border-strong bg-surface px-6 text-base font-extrabold text-foreground transition-colors duration-300 hover:bg-line-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function Actions({ state }: { state: PlatformState }) {
  const c = state.connection;
  if (state.ebay === "success" && c) {
    return (
      <div className="flex flex-wrap gap-3">
        <Link href={`/settings/integrations/ebay/setup?connection=${c.id}`} className={linkPrimary}>
          Configurer le catalogue
        </Link>
        <Link href="/dashboard" className={linkSecondary}>
          Aller au tableau de bord
        </Link>
      </div>
    );
  }
  if (state.ebay === "already") {
    return (
      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard" className={linkPrimary}>
          Aller au tableau de bord
        </Link>
        <Link href="/settings/integrations" className={linkSecondary}>
          Gérer la connexion
        </Link>
      </div>
    );
  }
  if (state.canConnect) {
    return (
      <div className="flex flex-col gap-3">
        <ConnectEbayForm label={state.ebay === "none" ? "Connecter mon compte eBay" : "Relancer la connexion"} />
        <p className="flex max-w-[520px] items-start gap-2 text-[12.5px] font-semibold leading-[18px] text-ink-3">
          <ShieldCheck aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
          Autorisation officielle eBay (OAuth) : vous êtes redirigé vers eBay, votre mot de passe n&apos;est jamais saisi ici. Accès révocable à tout moment.
        </p>
      </div>
    );
  }
  if (state.block === "not_admin") {
    return <Callout tone="neutral">Seuls les administrateurs de l&apos;organisation peuvent connecter eBay. Demandez-le à un administrateur, ou continuez sans plateforme.</Callout>;
  }
  return null;
}

/** Schéma « APRÈS AUTORISATION » (nuit) : Annonces → Commandes → Stock central ; câbles pleins une fois connecté. */
function AfterAuthorization({ lit }: { lit: boolean }) {
  const nodes = [
    { label: "Annonces", detail: "eBay → SKU" },
    { label: "Commandes", detail: "importées, −1 par ligne" },
    { label: "Stock central", detail: "une seule quantité" },
  ];
  return (
    <div className="flex flex-col justify-center gap-0 bg-night px-6 py-7 text-on-night min-[860px]:px-7">
      <p className="ms-mono text-[10px] leading-[13px] tracking-[0.08em] text-on-night-muted">{lit ? "Relié · après autorisation" : "Après autorisation"}</p>
      <ol className="mt-5 flex flex-col">
        {nodes.map((n, i) => (
          <li key={n.label} className="flex flex-col">
            {i > 0 ? (
              <span aria-hidden="true" className="ml-[13px] flex h-7 w-[2px] items-stretch">
                <span className={cn("block w-full", lit ? cn("bg-mint", motion.grow) : "border-l-2 border-dashed border-on-night/30")} style={lit ? { animationDelay: `${250 + i * 120}ms` } : undefined} />
              </span>
            ) : null}
            <span className="flex items-center gap-3">
              <span aria-hidden="true" className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border-2", lit ? "border-mint bg-mint/15" : "border-on-night/35")}>
                <span className={cn("block h-2.5 w-2.5 rounded-[3px]", lit ? "bg-mint" : "border border-on-night/40")} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold leading-5">{n.label}</span>
                <span className="block text-[12px] font-semibold leading-4 text-on-night-subtle">{n.detail}</span>
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
