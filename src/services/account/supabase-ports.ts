/**
 * Adaptateur Supabase des ports de suppression de compte (voir ./delete-account.ts).
 *
 * - `user` : client portant le JWT de l'utilisateur (RLS, auth.uid()) → RPC delete_organization ;
 * - `admin` : client service_role, SERVEUR UNIQUEMENT → procédures dédiées et API Auth admin.
 * Les erreurs de la base sont traduites par fromPostgrestError (message utilisateur, jamais brut).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { AppError, fromPostgrestError } from "@/lib/errors";
import type { AccountDeletionPlanRow, AccountDeletionPorts, UserOrgDeletion } from "@/services/account/delete-account";

type Client = SupabaseClient<Database>;

/** Code métier en tête du message (`raise exception 'CODE'`), sinon null. */
export function dbErrorCode(error: { message?: string | null } | null | undefined): string | null {
  const m = /^([A-Z][A-Z0-9_]+)\b/.exec(error?.message ?? "");
  return m?.[1] ?? null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function supabaseAccountDeletionPorts(clients: {
  user: Client;
  admin: Client;
  disconnectChannel: (connectionId: string, organizationId: string) => Promise<{ revoked: boolean }>;
}): AccountDeletionPorts {
  const { user, admin } = clients;
  return {
    async plan(userId) {
      const { data, error } = await admin.rpc("account_deletion_plan", { p_user_id: userId });
      if (error) throw fromPostgrestError(error);
      return (data ?? []).map(
        (r): AccountDeletionPlanRow => ({
          organizationId: r.organization_id,
          organizationName: r.organization_name,
          role: r.role,
          isDemo: r.is_demo,
          otherMembers: Number(r.other_members ?? 0),
          otherOwners: Number(r.other_owners ?? 0),
          hasOrders: Boolean(r.has_orders),
          activeChannelConnectionIds: r.active_channel_connection_ids ?? [],
          activeSupplierConnections: Number(r.active_supplier_connections ?? 0),
        }),
      );
    },
    async deleteOrganizationAsUser(organizationId, confirmationName): Promise<UserOrgDeletion> {
      const { error } = await user.rpc("delete_organization", { p_organization_id: organizationId, p_confirmation: confirmationName });
      if (!error) return { ok: true };
      return { ok: false, code: dbErrorCode(error), message: error.message };
    },
    disconnectChannel: clients.disconnectChannel,
    async deleteOrganizationForAccount(userId, organizationId) {
      const { data, error } = await admin.rpc("delete_account_organization", { p_user_id: userId, p_organization_id: organizationId });
      if (error) throw fromPostgrestError(error);
      const r = asObject(data);
      return { deleted: r.deleted === true, channelConnectionsDisconnected: Number(r.channel_connections_disconnected ?? 0) };
    },
    async deleteAccountData(userId) {
      const { data, error } = await admin.rpc("delete_account_data", { p_user_id: userId });
      if (error) throw fromPostgrestError(error);
      const r = asObject(data);
      return { membershipsRemoved: Number(r.memberships_removed ?? 0), profileDeleted: r.profile_deleted === true };
    },
    async deleteAuthUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (!error) return;
      // Déjà supprimé (nouvelle tentative après un échec réseau) : l'objectif est atteint.
      if (error.status === 404 || /not.?found/i.test(error.message)) return;
      throw new AppError("INTERNAL", "Vos données ont été supprimées, mais la fermeture de l'identifiant de connexion a échoué. Réessayez : la suppression reprendra là où elle s'est arrêtée.");
    },
  };
}
