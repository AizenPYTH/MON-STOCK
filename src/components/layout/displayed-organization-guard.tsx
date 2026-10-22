"use client";
import { useEffect } from "react";
import { wrapFetchWithDisplayedOrganization } from "@/lib/displayed-organization";

/** Organisation affichée par CET onglet (mise à jour à chaque rendu de la coquille). */
let displayedOrganizationId: string | null = null;
let installed = false;

/**
 * Joint l'organisation affichée aux requêtes d'écriture de l'onglet (W-07, voir
 * src/lib/displayed-organization.ts). Installé une seule fois par onglet ; ne rend rien.
 */
export function DisplayedOrganizationGuard({ organizationId }: { organizationId: string }) {
  useEffect(() => {
    displayedOrganizationId = organizationId;
    if (!installed) {
      installed = true;
      window.fetch = wrapFetchWithDisplayedOrganization(
        window.fetch.bind(window),
        () => displayedOrganizationId,
        () => window.location.origin,
      );
    }
  }, [organizationId]);
  return null;
}
