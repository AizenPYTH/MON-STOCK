import type { Metadata } from "next";
import { ContactLine, Fact, LegalPage, LegalSection } from "@/components/public/legal-page";
import { LEGAL, PROCESSORS } from "@/content/legal";

export const metadata: Metadata = { title: "Politique de confidentialité", description: "Données traitées par MON STOCK, finalités, prestataires et droits." };

export default function PrivacyPage() {
  return (
    <LegalPage title="Politique de confidentialité" intro="Cette page décrit les données que MON STOCK (site web et application iPhone) traite, pourquoi, avec quels prestataires, et comment exercer vos droits.">
      <LegalSection title="Responsable du traitement">
        <p>
          <Fact value={LEGAL.publisher} /> — <Fact value={LEGAL.address} />. Contact : <ContactLine />.
        </p>
      </LegalSection>

      <LegalSection title="Données traitées">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Compte</strong> : adresse e-mail et mot de passe (stocké sous forme hachée par le service d&apos;authentification, jamais lisible par nous), organisations et rôles.
          </li>
          <li>
            <strong>Données de votre activité</strong> que vous saisissez ou importez : produits, références, stock, coûts, prix, fournisseurs, commandes fournisseurs, fichiers de catalogues.
          </li>
          <li>
            <strong>Ventes eBay</strong>, si vous connectez votre compte : annonces, commandes et pseudonyme eBay de l&apos;acheteur. Les jetons d&apos;accès eBay sont chiffrés (AES-256-GCM).
          </li>
          <li>
            <strong>Comptes fournisseurs</strong>, si vous en connectez : identifiants chiffrés côté serveur (AES-256-GCM), jamais renvoyés à l&apos;application.
          </li>
          <li>
            <strong>Colis suivis</strong> : numéros de suivi que vous ajoutez et leurs événements.
          </li>
          <li>
            <strong>Conseiller et assistant IA</strong>, si vous les utilisez : vos questions et les données de votre organisation nécessaires à la réponse sont transmises à OpenAI ; l&apos;historique des conversations est conservé dans votre organisation.
          </li>
          <li>
            <strong>Dictée vocale (iPhone)</strong> : la reconnaissance vocale est assurée par le système de l&apos;iPhone (Apple) ; seul le texte obtenu est envoyé à MON STOCK.
          </li>
        </ul>
        <p>Aucun outil de publicité ni de mesure d&apos;audience tiers n&apos;est utilisé. Seuls des cookies techniques de session (connexion) sont déposés.</p>
      </LegalSection>

      <LegalSection title="Finalités et bases légales">
        <ul className="list-disc space-y-2 pl-5">
          <li>Fournir le service (gestion de stock, synchronisation, sourcing, outils) : exécution du contrat.</li>
          <li>Sécurité, prévention des abus, limites d&apos;usage de l&apos;IA : intérêt légitime.</li>
          <li>Obligations légales (comptabilité, réquisitions) : obligation légale.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Prestataires (sous-traitants)">
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-2">Prestataire</th>
                <th className="px-4 py-2">Rôle</th>
                <th className="px-4 py-2">Localisation</th>
              </tr>
            </thead>
            <tbody>
              {PROCESSORS.map((p) => (
                <tr key={p.name} className="border-t border-border align-top">
                  <td className="px-4 py-2 font-semibold">{p.name}</td>
                  <td className="px-4 py-2">{p.role}</td>
                  <td className="px-4 py-2">{p.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Les transferts hors de l&apos;Union européenne reposent sur les garanties prévues par le RGPD (clauses contractuelles types ou cadre de protection des données UE–États-Unis).</p>
      </LegalSection>

      <LegalSection title="Durée de conservation">
        <p>Les données sont conservées tant que le compte ou l&apos;organisation existe, puis supprimées dans un délai raisonnable après la demande de suppression, sauf obligation légale de conservation.</p>
      </LegalSection>

      <LegalSection title="Vos droits">
        <p>
          Vous disposez des droits d&apos;accès, de rectification, d&apos;effacement, de limitation, d&apos;opposition et de portabilité. Pour les exercer, ou pour supprimer votre compte, écrivez à <ContactLine />. Vous pouvez aussi saisir la CNIL (cnil.fr).
        </p>
      </LegalSection>
    </LegalPage>
  );
}
