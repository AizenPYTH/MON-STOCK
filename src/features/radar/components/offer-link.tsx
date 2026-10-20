import Link from "next/link";

/**
 * Lien étiré d'une carte du radar : à partir de 1280 px, ouvre le détail dans la colonne de droite
 * (`?offer=`) ; en dessous, ouvre la pleine page /radar/[offerId]. Un seul des deux est visible.
 */
export function OfferStretchLink({ columnHref, pageHref, label }: { columnHref: string; pageHref: string; label: string }) {
  const cls = "absolute inset-0 z-[1] rounded-[inherit]";
  return (
    <>
      <Link href={columnHref as never} scroll={false} aria-label={label} className={`${cls} hidden xl:block`} />
      <Link href={pageHref as never} aria-label={label} className={`${cls} xl:hidden`} />
    </>
  );
}
