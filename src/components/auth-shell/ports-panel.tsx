import { KeyRound, LockKeyhole, SquareDashed } from "lucide-react";
import { PortRow } from "@/components/marketing/port-row";
import { ChannelStatus } from "@/components/marketing/channel-status";

/** Garanties RÉELLES du service (aucune statistique, aucun témoignage). */
const ASSURANCES = [
  { icon: KeyRound, title: "eBay par autorisation officielle", text: "La connexion passe par la page d'eBay (OAuth) : votre mot de passe eBay n'est jamais demandé ni stocké." },
  { icon: LockKeyhole, title: "Identifiants protégés", text: "Jetons et accès fournisseurs chiffrés côté serveur, jamais renvoyés au navigateur." },
  { icon: SquareDashed, title: "Des chiffres honnêtes", text: "« ≈ » pour une estimation, « — » pour une valeur inconnue : jamais un 0 inventé." },
] as const;

const FUTURE = ["Amazon", "Shopify", "WooCommerce"] as const;

/**
 * Panneau « PORTS DU STOCK CENTRAL » (handoff v2 §D, §E) à gauche des formulaires d'inscription et
 * de connexion (≥ 1100 px) : eBay câble plein, DISPONIBLE ; Amazon, Shopify, WooCommerce câbles
 * ouverts, PROCHAINEMENT (aucune date, aucun bouton) ; puis trois assurances. Bus vertical à droite,
 * menthe au niveau d'eBay seulement. Composant serveur.
 */
export function PortsPanel() {
  return (
    <aside aria-labelledby="ports-titre" className="overflow-hidden rounded-[26px] bg-night text-on-night">
      <div className="px-7 pb-2 pt-7">
        <h2 id="ports-titre" className="ms-mono text-[10.5px] leading-[14px] tracking-[0.08em] text-on-night-muted">
          Ports du stock central
        </h2>
        <p className="mt-2 max-w-[440px] text-[15px] font-medium leading-[22px] text-on-night-muted">Un seul stock, un port par canal. eBay est branché aujourd&apos;hui ; les autres arrivent, sans date annoncée.</p>
      </div>
      <div className="relative px-7 pr-[56px]">
        <ul className="divide-y divide-night-line">
          <PortRow name="eBay" state="lit" size="sm" status={<ChannelStatus state="available" size="sm" />} />
          {FUTURE.map((name) => (
            <PortRow key={name} name={name} state="open" size="sm" status={<ChannelStatus state="soon" size="sm" />} cableLabel="" />
          ))}
        </ul>
        {/* Bus vertical (décoratif) : la prise eBay est la seule reliée. */}
        <span aria-hidden="true" className="absolute bottom-3 right-7 top-3 flex w-[22px] flex-col items-center">
          <span className="block w-[3px] flex-1 rounded-full bg-on-night/12">
            <span className="block h-1/4 w-full rounded-full bg-mint" />
          </span>
          <span className="ms-mono mt-2 text-[8.5px] leading-[10px] tracking-[0.08em] text-on-night-subtle [writing-mode:vertical-rl]">Stock central</span>
        </span>
      </div>
      <ul className="mt-3 grid gap-4 border-t border-night-line px-7 pb-7 pt-5">
        {ASSURANCES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3">
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-night-stroke text-mint">
              <Icon className="h-4 w-4" strokeWidth={1.9} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-bold leading-5 text-on-night">{title}</span>
              <span className="mt-0.5 block text-[13px] font-medium leading-[18px] text-on-night-muted">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
