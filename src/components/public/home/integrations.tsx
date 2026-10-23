import { Check } from "lucide-react";
import { Accent } from "@/components/marketing/serif-accent";
import { ChannelStatus } from "@/components/marketing/channel-status";
import { PortRow } from "@/components/marketing/port-row";

/** Rôle d'un service qui n'est PAS un canal de vente (ne modifie pas le stock). */
function RoleTag({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-[6px] border border-on-night/18 px-[6px] py-[4px] font-mono text-[9px] font-semibold uppercase leading-none tracking-[0.08em] text-[#B4BECB]">{children}</span>;
}

const SOON = ["Amazon", "Shopify", "WooCommerce"] as const;

/**
 * Intégrations (handoff v2 §C.5, `PatchPanel`) : nuit pleine largeur, panneau de brassage de 8 lignes,
 * bus vertical « STOCK CENTRAL » à droite (menthe sur la 1ʳᵉ ligne, gris ensuite).
 * Vérité du dépôt (G) : eBay est le seul canal disponible ; Amazon, Shopify, WooCommerce sont
 * « prochainement » (connecteurs non implémentés). BigBuy et Ingram Micro sont des comptes
 * fournisseurs (prix d'achat, src/integrations/sourcing), Sendcloud et Boxtal des devis d'expédition
 * (src/integrations/shipping) : ce ne sont pas des canaux de vente, ils ne se branchent pas sur le
 * stock ; ils sont présentés comme tels, sans date ni promesse.
 */
export function Integrations() {
  return (
    <section id="integrations" aria-labelledby="integrations-titre" className="scroll-mt-20 bg-night text-on-night">
      <div className="mx-auto w-full max-w-[1352px] px-[18px] py-20 min-[760px]:px-8 min-[760px]:py-28 min-[1100px]:px-14 min-[1100px]:py-36">
        <div className="grid gap-8 min-[1100px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] min-[1100px]:items-end">
          <div>
            <p data-r="" className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-on-night-muted">Intégrations</p>
            <h2 id="integrations-titre" data-r="" style={{ "--d": "80ms" } as React.CSSProperties} className="mt-4 text-[38px] font-extrabold leading-none tracking-[-0.045em] min-[760px]:text-[56px] min-[1100px]:text-[76px]">
              Un seul câble branché. <Accent className="text-mint">Les autres arrivent.</Accent>
            </h2>
          </div>
          <p data-r="" style={{ "--d": "160ms" } as React.CSSProperties} className="max-w-[460px] text-[17px] font-medium leading-[1.55] text-[#B4BECB] min-[760px]:text-[19px]">
            Câble plein&nbsp;: le canal est réellement branché sur votre stock. Câble ouvert&nbsp;: pas encore. Aucun bouton de connexion, aucune date tant qu&apos;un canal n&apos;est pas prêt.
          </p>
        </div>

        {/* Panneau de brassage. */}
        <div data-r="" className="relative mt-12 overflow-hidden rounded-[26px] border border-on-night/10 bg-[#0C1724] min-[760px]:mt-16">
          {/* Bus vertical STOCK CENTRAL. */}
          <div aria-hidden="true" className="absolute inset-y-0 right-[18px] w-[3px] rounded-full bg-on-night/14 min-[760px]:right-[46px]" />
          <span aria-hidden="true" className="absolute right-[23px] top-1/2 hidden -translate-y-1/2 translate-x-1/2 rotate-90 whitespace-nowrap font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-on-night-subtle min-[760px]:block">
            Stock central
          </span>

          <div className="pl-5 pr-[21px] min-[760px]:pl-8 min-[760px]:pr-[49px]">
            <p className="flex items-center justify-between border-b border-on-night/8 py-3.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-on-night-subtle">
              <span>Canaux de vente</span>
            </p>
            <ul aria-label="Canaux de vente">
              <PortRow
                name="eBay"
                state="lit"
                size="lg"
                status={<ChannelStatus state="available" />}
                detail="Commandes importées et déduites du stock, annonces rapprochées de vos SKU."
                className="border-b border-on-night/8 before:absolute before:-right-[3px] before:inset-y-0 before:w-[3px] before:bg-mint"
              />
              {SOON.map((n) => (
                <PortRow key={n} name={n} state="open" size="md" status={<ChannelStatus state="soon" />} className="border-b border-on-night/8" />
              ))}
            </ul>
            <p className="flex items-center justify-between border-b border-on-night/8 pb-3.5 pt-6 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-on-night-subtle">
              <span>Autres services · ne modifient pas le stock</span>
            </p>
            <ul aria-label="Autres services">
              <PortRow name="BigBuy" state="open" size="sm" status={<RoleTag>Prix fournisseur</RoleTag>} cableLabel="Hors stock" className="border-b border-on-night/8" />
              <PortRow name="Ingram Micro" state="open" size="sm" status={<RoleTag>Prix fournisseur</RoleTag>} cableLabel="Hors stock" className="border-b border-on-night/8" />
              <PortRow name="Sendcloud" state="open" size="sm" status={<RoleTag>Devis d&apos;expédition</RoleTag>} cableLabel="Hors stock" className="border-b border-on-night/8" />
              <PortRow name="Boxtal" state="open" size="sm" status={<RoleTag>Devis d&apos;expédition</RoleTag>} cableLabel="Hors stock" />
            </ul>
          </div>
        </div>
        <p className="mt-4 max-w-[860px] text-[13.5px] font-medium leading-[20px] text-on-night-muted">
          BigBuy et Ingram Micro fournissent des prix et disponibilités d&apos;achat (compte fournisseur)&nbsp;; Sendcloud et Boxtal, des devis de frais de port. Ce ne sont pas des canaux de vente&nbsp;: aucun n&apos;écrit dans votre stock.
        </p>

        {/* Ce que fait la connexion eBay aujourd'hui. */}
        <div className="mt-14 grid gap-8 border-t border-on-night/10 pt-10 min-[1100px]:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
          <h3 data-r="" className="text-[24px] font-extrabold leading-[1.1] tracking-[-0.03em] min-[760px]:text-[30px]">
            Ce que fait la connexion eBay <Accent className="text-mint">aujourd&apos;hui.</Accent>
          </h3>
          <ul className="grid gap-6 min-[760px]:grid-cols-3">
            {[
              { t: "Commandes importées", d: "Chaque vente eBay est importée à la synchronisation et déduite du stock une seule fois." },
              { t: "Annonces rapprochées", d: "Vos annonces actives sont lues et reliées à vos SKU, pour savoir quelle quantité est en ligne." },
              { t: "Quantités renvoyées, si vous le voulez", d: "Désactivé par défaut. Une fois activé, le stock disponible est envoyé vers les annonces reliées." },
            ].map((b, i) => (
              <li key={b.t} data-r="" style={{ "--d": `${i * 90}ms` } as React.CSSProperties} className="flex flex-col gap-2">
                <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-mint text-night">
                  <Check className="h-4 w-4" strokeWidth={2.6} />
                </span>
                <span className="text-[16.5px] font-bold text-on-night">{b.t}</span>
                <span className="text-[15px] font-medium leading-[1.55] text-on-night-muted">{b.d}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-8 text-[13.5px] font-medium text-on-night-muted">Connexion par l&apos;autorisation officielle eBay (OAuth)&nbsp;: aucun mot de passe eBay n&apos;est demandé ni stocké.</p>
      </div>
    </section>
  );
}
