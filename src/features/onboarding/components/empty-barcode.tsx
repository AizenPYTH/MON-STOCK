import { BarcodeField } from "@/components/marketing/barcode-field";

/**
 * État vide du code-barres du stock (tableau de bord sans aucune référence) : un champ de barres
 * fantômes, à peine visible, et la règle de lecture. Aucune barre allumée, aucun chiffre : il n'y a
 * pas encore de donnée. Décoratif (`aria-hidden`), le texte porte l'information.
 */
export function EmptyBarcode() {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <BarcodeField n={64} seed={20261023} height={56} mobileHeight={44} growMs={700} growDelayMs={150} growStepMs={12} growFrom={0} className="opacity-70" />
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 block border-t border-dashed border-night-stroke" />
      </div>
      <p className="max-w-[640px] text-[13.5px] font-semibold leading-[19px] text-on-night-muted">
        Aucune référence pour l&apos;instant. Chaque produit ajouté deviendra une barre : sa largeur suivra ses ventes, sa couleur son niveau de stock.
      </p>
    </div>
  );
}
