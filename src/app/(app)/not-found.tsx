import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      icon={<SearchX className="h-6 w-6" aria-hidden="true" />}
      title="Introuvable"
      description="Cet élément n'existe pas, a été supprimé ou n'appartient pas à votre organisation."
      action={
        <ButtonLink href="/dashboard" variant="secondary">
          Retour au tableau de bord
        </ButtonLink>
      }
    />
  );
}
