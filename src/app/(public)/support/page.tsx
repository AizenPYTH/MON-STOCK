import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalPage, LegalSection } from "@/components/public/legal-page";

export const metadata: Metadata = { title: "Support", description: "Aide et contact MON STOCK." };

export default function SupportPage() {
  return (
    <LegalPage title="Support" intro="Une question, un problème, une demande d'accès à l'application iPhone ?">
      <LegalSection title="Nous écrire">
        <p>
          <ContactLine /> — précisez le nom de votre organisation et, pour un problème, l&apos;écran concerné et l&apos;heure.
        </p>
      </LegalSection>
      <LegalSection title="Mot de passe oublié">
        <p>
          Utilisez{" "}
          <Link href="/reset-password" prefetch={false} className="font-semibold text-interactive underline">
            la page de réinitialisation
          </Link>{" "}
          : un lien vous est envoyé par e-mail.
        </p>
      </LegalSection>
      <LegalSection title="Supprimer mon compte ou mes données">
        <p>
          Depuis le site, connecté : Réglages → Mon compte → « Supprimer mon compte ». La suppression est définitive et demande une confirmation saisie.
        </p>
        <p>
          Vous pouvez aussi écrire à <ContactLine /> depuis l&apos;adresse de votre compte. Voir aussi la{" "}
          <Link href="/confidentialite" className="font-semibold text-interactive underline">
            politique de confidentialité
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
