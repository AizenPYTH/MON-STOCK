import type { Metadata } from "next";
import { ContactLine, Fact, LegalPage, LegalSection } from "@/components/public/legal-page";
import { LEGAL, PROCESSORS } from "@/content/legal";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

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
            <strong>Conseiller et assistant IA</strong>, si vous les utilisez : vos questions et les données de votre organisation nécessaires à la réponse sont transmises à OpenAI. Pour une question sur une commande ou un message eBay, cela peut inclure, lus en direct chez eBay : le pseudo de l&apos;acheteur, le nom, la ville, le code postal et le pays du destinataire (jamais la rue, le téléphone ni l&apos;e-mail), les en-têtes de vos messages eBay et, seulement si vous demandez à le lire, le texte d&apos;un message (e-mails et téléphones masqués). L&apos;historique des conversations est conservé dans votre organisation.
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
        <Table className="min-w-[600px] text-[14px] leading-5" stackOnMobile caption="Prestataires (sous-traitants) et leur localisation">
          <THead>
            <tr>
              <TH>Prestataire</TH>
              <TH>Rôle</TH>
              <TH>Localisation</TH>
            </tr>
          </THead>
          <TBody>
            {PROCESSORS.map((p) => (
              <TR key={p.name} className="align-top hover:bg-transparent">
                <TD primary className="font-bold text-foreground">
                  {p.name}
                </TD>
                <TD label="Rôle" className="text-left text-muted-strong">
                  {p.role}
                </TD>
                <TD label="Localisation" className="text-left text-muted-strong">
                  {p.location}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <p>Les transferts hors de l&apos;Union européenne reposent sur les garanties prévues par le RGPD (clauses contractuelles types ou cadre de protection des données UE–États-Unis).</p>
      </LegalSection>

      <LegalSection title="Durée de conservation">
        <p>Les données sont conservées tant que le compte ou l&apos;organisation existe, puis supprimées dans un délai raisonnable après la demande de suppression, sauf obligation légale de conservation.</p>
      </LegalSection>

      <LegalSection title="Vos droits">
        <p>
          Vous disposez des droits d&apos;accès, de rectification, d&apos;effacement, de limitation, d&apos;opposition et de portabilité. Pour les exercer, écrivez à <ContactLine />. Vous pouvez aussi saisir la CNIL (cnil.fr).
        </p>
        <p>
          Vous pouvez supprimer vous-même votre compte depuis le site : Réglages → Mon compte → « Supprimer mon compte » (organisations dont vous êtes le seul membre comprises). Vous pouvez aussi en faire la demande par écrit à l&apos;adresse ci-dessus.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
