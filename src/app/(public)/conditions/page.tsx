import type { Metadata } from "next";
import { ContactLine, Fact, LegalPage, LegalSection } from "@/components/public/legal-page";
import { LEGAL } from "@/content/legal";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

export default function TermsPage() {
  return (
    <LegalPage title="Conditions d'utilisation" intro="Ces conditions encadrent l'utilisation de MON STOCK (site web et application iPhone).">
      <LegalSection title="Service">
        <p>
          MON STOCK est édité par <Fact value={LEGAL.publisher} />. Le service aide à suivre un stock, des ventes et des offres de fournisseurs. Il est actuellement en phase de test : des fonctions peuvent évoluer ou être interrompues.
        </p>
      </LegalSection>
      <LegalSection title="Compte et organisation">
        <p>Vous êtes responsable de la confidentialité de vos identifiants et des personnes que vous invitez dans votre organisation. Les rôles définissent qui peut consulter ou modifier les données.</p>
      </LegalSection>
      <LegalSection title="Chiffres, estimations et décisions">
        <p>
          Les marges, prix de marché, scores et conseils sont des <strong>estimations</strong> signalées comme telles (« ≈ », « provisoire »). Ils dépendent des données disponibles (prix fournisseurs, frais saisis) et ne garantissent aucun résultat. Aucun achat ni commande n&apos;est passé auprès d&apos;un fournisseur sans votre action explicite ; les actions proposées par le conseiller IA attendent votre confirmation.
        </p>
      </LegalSection>
      <LegalSection title="Services tiers">
        <p>La connexion à eBay, à un compte fournisseur ou à un transporteur est soumise aux conditions de ces services. Vous devez disposer des droits nécessaires sur les catalogues et flux que vous importez.</p>
      </LegalSection>
      <LegalSection title="Contact">
        <p>
          Questions et réclamations : <ContactLine />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
