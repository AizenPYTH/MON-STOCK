import { EmptyState } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return <EmptyState title="Introuvable" description="Cet élément n'existe pas ou n'appartient pas à votre organisation." action={<ButtonLink href="/dashboard" variant="secondary">Retour au tableau de bord</ButtonLink>} />;
}
