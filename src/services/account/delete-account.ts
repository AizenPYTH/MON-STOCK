/**
 * Suppression de compte initiée par l'utilisateur (audit M-01 / Q-04, App Store 5.1.1(v)).
 *
 * Orchestration PURE : toutes les lectures et écritures passent par des « ports » injectés
 * (adaptateur Supabase en production : ./supabase-ports.ts ; base PostgreSQL locale dans les tests
 * d'intégration ; ports simulés dans les tests unitaires). Réutilisable par le web (Server Action)
 * comme par l'Edge Function (POST /account/delete) : l'appelant revérifie le jeton (getUser) et
 * transmet l'identifiant de l'utilisateur AUTHENTIFIÉ — jamais un identifiant venu du client.
 *
 * Ordre (chaque étape est idempotente : un échec en cours de route peut être relancé) :
 *  1. confirmation explicite (« SUPPRIMER ») ;
 *  2. plan : organisations, rôles, autres membres ;
 *  3. refus si l'utilisateur est le SEUL propriétaire d'une organisation qui a d'autres membres
 *     (rien n'est modifié) ;
 *  4. organisations dont il est le seul membre : RPC delete_organization (sous son jeton, avec le
 *     nom exact) ; si ses garde-fous bloquent (commandes, connexion active, rôle), tentative de
 *     révocation distante des connexions de vente puis procédure dédiée
 *     delete_account_organization (déconnexion locale + suppression, service_role) ;
 *  5. conversations du conseiller, adhésions restantes et profil (delete_account_data) ;
 *  6. utilisateur d'authentification (API d'administration, service_role côté serveur).
 *
 * Journal : compteurs uniquement (aucun identifiant, e-mail ou nom d'organisation).
 */
import { AppError } from "@/lib/errors";
import { ACCOUNT_DELETE_CONFIRMATION, type AccountDeletionResultDTO } from "@/features/mobile-api/contract";

export interface AccountDeletionPlanRow {
  organizationId: string;
  organizationName: string;
  role: "owner" | "admin" | "member" | "viewer";
  isDemo: boolean;
  otherMembers: number;
  otherOwners: number;
  hasOrders: boolean;
  activeChannelConnectionIds: string[];
  activeSupplierConnections: number;
}

/** Résultat de la RPC delete_organization appelée sous le jeton de l'utilisateur. */
export type UserOrgDeletion = { ok: true } | { ok: false; code: string | null; message: string };

export interface AccountDeletionPorts {
  plan(userId: string): Promise<AccountDeletionPlanRow[]>;
  /** RPC existante `delete_organization` (jeton de l'utilisateur, garde-fous intacts). */
  deleteOrganizationAsUser(organizationId: string, confirmationName: string): Promise<UserOrgDeletion>;
  /** Révocation distante + déconnexion locale d'une connexion de vente (peut échouer : non bloquant). */
  disconnectChannel(connectionId: string, organizationId: string): Promise<{ revoked: boolean }>;
  /** Procédure dédiée `delete_account_organization` (service_role). */
  deleteOrganizationForAccount(userId: string, organizationId: string): Promise<{ deleted: boolean; channelConnectionsDisconnected: number }>;
  /** `delete_account_data` (service_role) : conversations, adhésions, profil. */
  deleteAccountData(userId: string): Promise<{ membershipsRemoved: number; profileDeleted: boolean }>;
  /** Supabase Auth admin `deleteUser` ; un utilisateur déjà absent n'est pas une erreur. */
  deleteAuthUser(userId: string): Promise<void>;
}

export interface AccountDeletionLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

/** Refus de la RPC delete_organization qui justifient la procédure dédiée (et rien d'autre). */
const FALLBACK_CODES = new Set(["ORGANIZATION_HAS_ORDERS", "ORGANIZATION_HAS_CONNECTION", "FORBIDDEN"]);

export function isAccountDeleteConfirmation(value: unknown): boolean {
  return typeof value === "string" && value.trim() === ACCOUNT_DELETE_CONFIRMATION;
}

/** Organisations qui empêchent la suppression : seul propriétaire, avec d'autres membres. */
export function soleOwnerBlockers(plan: readonly AccountDeletionPlanRow[]): AccountDeletionPlanRow[] {
  return plan.filter((p) => p.role === "owner" && p.otherMembers > 0 && p.otherOwners === 0);
}

export function soleOwnerMessage(blockers: readonly AccountDeletionPlanRow[]): string {
  const names = blockers.map((b) => `« ${b.organizationName} »`).join(", ");
  const plural = blockers.length > 1;
  return `Suppression impossible : vous êtes le seul propriétaire de ${names}, qui ${plural ? "comptent" : "compte"} d'autres membres. Désignez un autre propriétaire ou retirez les membres (site web → Réglages → Utilisateurs), puis réessayez. Rien n'a été supprimé.`;
}

export async function deleteAccount(
  ports: AccountDeletionPorts,
  input: { userId: string; confirmation: unknown },
  log?: AccountDeletionLogger,
): Promise<AccountDeletionResultDTO> {
  if (!isAccountDeleteConfirmation(input.confirmation)) {
    throw new AppError("VALIDATION", `Saisissez ${ACCOUNT_DELETE_CONFIRMATION} pour confirmer la suppression définitive.`);
  }
  if (!input.userId) throw new AppError("AUTH_REQUIRED", "Connexion requise.");

  const plan = await ports.plan(input.userId);
  const blockers = soleOwnerBlockers(plan);
  if (blockers.length > 0) {
    log?.info("suppression de compte refusée : seul propriétaire d'une organisation partagée", { blockingOrganizations: blockers.length });
    throw new AppError("CONFLICT", soleOwnerMessage(blockers));
  }

  const solo = plan.filter((p) => p.otherMembers === 0);
  let viaRpc = 0;
  let viaProcedure = 0;
  let channelsDisconnected = 0;
  let remoteRevocationIncomplete = false;

  for (const org of solo) {
    const attempt = await ports.deleteOrganizationAsUser(org.organizationId, org.organizationName);
    if (attempt.ok) {
      viaRpc += 1;
      continue;
    }
    if (attempt.code === "ORGANIZATION_HAS_MEMBERS") {
      throw new AppError("CONFLICT", `Suppression interrompue : un membre a rejoint « ${org.organizationName} » entre-temps. Retirez-le ou désignez-le propriétaire, puis réessayez.`);
    }
    if (!attempt.code || !FALLBACK_CODES.has(attempt.code)) {
      log?.warn("suppression de compte interrompue : organisation non supprimée", { step: "delete_organization", code: attempt.code ?? "UNKNOWN" });
      throw new AppError("INTERNAL", "Suppression du compte interrompue : une organisation n'a pas pu être supprimée. Réessayez dans un instant ; rien d'autre n'a été modifié pour cette organisation.");
    }
    // Garde-fous de la RPC (commandes, connexion active) : procédure dédiée. Avant, tentative de
    // révocation distante de chaque connexion de vente ; un échec n'empêche pas la suppression
    // locale des jetons (faite par la procédure), il est seulement signalé à l'utilisateur.
    for (const connectionId of org.activeChannelConnectionIds) {
      try {
        const r = await ports.disconnectChannel(connectionId, org.organizationId);
        channelsDisconnected += 1;
        if (!r.revoked) remoteRevocationIncomplete = true;
      } catch {
        remoteRevocationIncomplete = true;
      }
    }
    const r = await ports.deleteOrganizationForAccount(input.userId, org.organizationId);
    channelsDisconnected += r.channelConnectionsDisconnected;
    if (r.deleted) viaProcedure += 1;
  }

  const data = await ports.deleteAccountData(input.userId);
  await ports.deleteAuthUser(input.userId);

  const result: AccountDeletionResultDTO = {
    deleted: true,
    organizationsDeleted: viaRpc + viaProcedure,
    organizationsLeft: plan.length - solo.length,
    channelConnectionsDisconnected: channelsDisconnected,
    remoteRevocationIncomplete,
  };
  // Aucune donnée personnelle : ni identifiant, ni e-mail, ni nom d'organisation.
  log?.info("compte supprimé", {
    organizationsDeleted: result.organizationsDeleted,
    viaRpc,
    viaProcedure,
    organizationsLeft: result.organizationsLeft,
    membershipsRemoved: data.membershipsRemoved,
    channelConnectionsDisconnected: channelsDisconnected,
    remoteRevocationIncomplete,
  });
  return result;
}
