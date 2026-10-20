import { Mail } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { CopyButton } from "@/features/directory/components/copy-text-button";
import { mailtoLink } from "@/features/directory/labels";

/**
 * E-mail de demande d'accès prêt à copier (FR / EN). Rédigé par le serveur ; rien n'est envoyé
 * automatiquement : l'utilisateur choisit le destinataire dans sa messagerie.
 */
export function AccessEmail({ email, lang, idPrefix }: { email: { subject: string; body: string }; lang: "fr" | "en"; idPrefix: string }) {
  const full = `${email.subject}\n\n${email.body}`;
  const fr = lang === "fr";
  return (
    <div lang={lang} className="overflow-hidden rounded-2xl border border-border bg-surface">
      <pre
        id={`${idPrefix}-${lang}-message`}
        tabIndex={0}
        aria-label={fr ? "E-mail de demande d'accès" : "Access request e-mail"}
        className="max-h-[260px] overflow-auto whitespace-pre-wrap border-b border-line-soft bg-[#F7F8FA] px-4 py-3.5 font-sans text-[13px] font-medium leading-[19px] text-foreground"
      >
        {`${fr ? "Objet" : "Subject"} : ${email.subject}\n\n${email.body}`}
      </pre>
      <div className="flex flex-wrap gap-2 px-3 py-2.5">
        <CopyButton text={full} label={fr ? "Copier" : "Copy"} copiedLabel={fr ? "Copié" : "Copied"} className="w-full font-extrabold" wrapperClassName="min-w-[140px] flex-1" />
        <a href={mailtoLink(email)} className={buttonClasses("secondary", "md", "min-w-[140px] flex-1 font-extrabold")}>
          <Mail aria-hidden="true" className="h-4 w-4" />
          {fr ? "Ouvrir la messagerie" : "Open my mail app"}
        </a>
      </div>
    </div>
  );
}
