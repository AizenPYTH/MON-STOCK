import { ExternalLink } from "lucide-react";
import type { LibraryEntryDTO } from "@/services/sourcing/source-library";
import { ButtonLink } from "@/components/ui/button";
import { CHECK_STATUS_LABEL } from "@/features/sources/labels";
import { ActivateLibraryForm } from "@/features/directory/components/activate-library-form";
import { ConnectAccountForm, SyncAccountForm } from "@/features/pro-accounts/components/account-forms";
import type { DirectoryEntry } from "@/features/directory/labels";

/** Lien d'import de catalogue pré-rempli avec le fournisseur de la fiche. */
export function importHref(e: Pick<DirectoryEntry, "name" | "org">): string {
  const sp = new URLSearchParams({ supplierName: e.name });
  if (e.org.supplierId) sp.set("supplierId", e.org.supplierId);
  return `/sourcing/imports/new?${sp.toString()}`;
}

const WRITE_KINDS = new Set(["sync", "connect_api", "add_feed", "import_catalog", "activate_public"]);

/**
 * Action principale d'une fiche de l'annuaire, exécutée pour de vrai (jamais une connexion
 * simulée) : synchroniser, connecter l'API, ajouter un flux, importer, activer le catalogue
 * public, ou ouvrir le site du fournisseur.
 */
export function PrimaryAction({ entry: e, canWrite, library }: { entry: DirectoryEntry; canWrite: boolean; library: LibraryEntryDTO | null }) {
  const a = e.registry.primaryAction;
  if (a.kind === "none") return null;
  if (!canWrite && WRITE_KINDS.has(a.kind)) return <p className="text-sm text-muted">Votre rôle ne permet pas de modifier les sources. Demandez à un administrateur.</p>;
  const site = e.catalogUrl ?? e.website;
  switch (a.kind) {
    case "sync":
      return e.org.connectionId ? <SyncAccountForm connectionId={e.org.connectionId} label={a.label} /> : <ButtonLink href="/sourcing/sources">{a.label}</ButtonLink>;
    case "connect_api":
      return e.connector ? <ConnectAccountForm accountKey={e.key} accountName={e.name} fields={e.connector.fields} /> : <p className="text-sm text-muted">Connecteur indisponible sur ce serveur.</p>;
    case "add_feed":
      return <ButtonLink href="/sourcing/sources/new-feed">{a.label}</ButtonLink>;
    case "import_catalog":
      return <ButtonLink href={importHref(e)}>{a.label}</ButtonLink>;
    case "activate_public":
      if (library?.sourceId) return <p className="text-sm text-success">Catalogue public déjà activé dans votre organisation.</p>;
      if (library && library.activatable) return <ActivateLibraryForm libraryKey={library.key} name={library.name} termsUrl={library.termsUrl} termsConfirmed={library.termsStatus === "confirmed"} />;
      return (
        <p className="text-sm text-muted">
          Activation impossible pour l&apos;instant : {library?.blocked ?? (library?.check ? (CHECK_STATUS_LABEL[library.check.status] ?? library.check.status) : "source pas encore vérifiée par le serveur")}.
        </p>
      );
    case "get_pro_access":
    case "open_site":
      return site ? (
        <ButtonLink href={site} variant={a.kind === "open_site" ? "secondary" : "primary"}>
          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          {a.label}
        </ButtonLink>
      ) : (
        <p className="text-sm text-muted">Aucun site officiel identifié par la recherche.</p>
      );
  }
}

/**
 * Lien de l'action principale sur une carte de l'annuaire : direct quand c'est une page
 * (import, flux, site du fournisseur), sinon la fiche où l'action s'exécute (synchroniser,
 * connecter l'API avec vos identifiants, activer le catalogue public après attestation).
 */
export function cardActionLink(e: DirectoryEntry, canWrite: boolean): { label: string; href: string; external: boolean } {
  const a = e.registry.primaryAction;
  const fiche = `/suppliers/directory/${encodeURIComponent(e.key)}`;
  if (a.kind === "none" || (!canWrite && WRITE_KINDS.has(a.kind))) return { label: "Voir la fiche", href: fiche, external: false };
  switch (a.kind) {
    case "import_catalog":
      return { label: a.label, href: importHref(e), external: false };
    case "add_feed":
      return { label: a.label, href: "/sourcing/sources/new-feed", external: false };
    case "get_pro_access":
    case "open_site": {
      const site = e.catalogUrl ?? e.website;
      return site ? { label: a.label, href: site, external: true } : { label: "Voir la fiche", href: fiche, external: false };
    }
    case "connect_api":
    case "activate_public":
      return { label: a.label, href: `${fiche}?tab=acces#action`, external: false };
    default:
      return { label: a.label, href: fiche, external: false };
  }
}
