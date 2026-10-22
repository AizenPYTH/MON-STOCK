-- Retour arrière MANUEL de 20261023000600_account_deletion.sql (M-01).
-- Retire les trois fonctions serveur de suppression de compte. Idempotent (if exists).
-- Les comptes déjà supprimés ne sont PAS restaurés (seule une restauration de sauvegarde le
-- permettrait). Après ce retour arrière, la route Edge POST /account/delete répond une erreur
-- serveur : redéployer aussi l'Edge Function précédente (ou masquer l'écran dans l'application).

drop function if exists public.delete_account_data(uuid);
drop function if exists public.delete_account_organization(uuid, uuid);
drop function if exists public.account_deletion_plan(uuid);
