import { Mail } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Label } from "@/components/ui/form";
import { CopyButton } from "@/features/directory/components/copy-button";
import { mailtoLink } from "@/features/directory/labels";

/**
 * E-mail de demande d'accès prêt à copier (FR / EN). Rédigé par le serveur ; rien n'est envoyé
 * automatiquement : l'utilisateur choisit le destinataire dans sa messagerie.
 */
export function AccessEmail({ email, lang, idPrefix }: { email: { subject: string; body: string }; lang: "fr" | "en"; idPrefix: string }) {
  const subjectId = `${idPrefix}-${lang}-subject`;
  const bodyId = `${idPrefix}-${lang}-body`;
  const full = `${email.subject}\n\n${email.body}`;
  return (
    <div className="space-y-3" lang={lang}>
      <div>
        <Label htmlFor={subjectId}>{lang === "fr" ? "Objet" : "Subject"}</Label>
        <input id={subjectId} readOnly value={email.subject} className="block h-9 w-full rounded-lg border border-border bg-surface-muted px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <div>
        <Label htmlFor={bodyId}>{lang === "fr" ? "Message" : "Message"}</Label>
        <textarea id={bodyId} readOnly value={email.body} rows={12} className="block w-full rounded-lg border border-border bg-surface-muted px-3 py-2 font-mono text-xs leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={full} label={lang === "fr" ? "Copier l'objet et le message" : "Copy subject and message"} copiedLabel={lang === "fr" ? "Copié" : "Copied"} />
        <a href={mailtoLink(email)} className={buttonClasses("ghost", "sm")}>
          <Mail aria-hidden="true" className="h-3.5 w-3.5" />
          {lang === "fr" ? "Ouvrir dans ma messagerie" : "Open in my mail app"}
        </a>
      </div>
    </div>
  );
}
