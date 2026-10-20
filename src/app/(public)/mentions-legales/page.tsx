import type { Metadata } from "next";
import { ContactLine, Fact, LegalPage, LegalSection } from "@/components/public/legal-page";
import { HOST, LEGAL } from "@/content/legal";

export const metadata: Metadata = { title: "Mentions légales" };

export default function LegalNoticePage() {
  return (
    <LegalPage title="Mentions légales">
      <LegalSection title="Éditeur">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[14rem_1fr]">
          <dt className="text-muted">Raison sociale ou nom</dt>
          <dd><Fact value={LEGAL.publisher} /></dd>
          <dt className="text-muted">Forme juridique</dt>
          <dd><Fact value={LEGAL.legalForm} /></dd>
          <dt className="text-muted">Adresse</dt>
          <dd><Fact value={LEGAL.address} /></dd>
          <dt className="text-muted">Immatriculation (SIREN / RCS)</dt>
          <dd><Fact value={LEGAL.registration} /></dd>
          <dt className="text-muted">Directeur de la publication</dt>
          <dd><Fact value={LEGAL.publicationDirector} /></dd>
          <dt className="text-muted">Contact</dt>
          <dd><ContactLine /></dd>
        </dl>
      </LegalSection>
      <LegalSection title="Hébergement">
        <p>
          {HOST.name}, {HOST.address} — {HOST.website}
        </p>
        <p>Données de l&apos;application : Supabase, région Union européenne (Irlande).</p>
      </LegalSection>
      <LegalSection title="Propriété intellectuelle">
        <p>Les marques et logos de fournisseurs affichés dans l&apos;application servent uniquement à les identifier ; ils restent la propriété de leurs titulaires et n&apos;impliquent aucun partenariat.</p>
      </LegalSection>
    </LegalPage>
  );
}
