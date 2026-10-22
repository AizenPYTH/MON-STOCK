-- =============================================================================
-- MON STOCK — migration 20261023000110 : un compte marketplace n'est relié qu'à UNE connexion active
-- (audit 2026-10-22 : D-04, I-07).
--
-- Avant : l'unicité ne portait que sur sales_channel_id. Le même compte eBay pouvait être connecté
-- dans deux organisations (ou deux fois dans la même, callbacks concurrents) : commandes importées
-- et déduites deux fois, refresh tokens rafraîchis en concurrence, quantités poussées
-- contradictoires.
-- Après : index unique partiel (provider, environment, external_account_id) sur les connexions
-- NON déconnectées. Un compte sandbox et un compte production restent indépendants ; une connexion
-- déconnectée (ou anonymisée après suppression du compte : external_account_id NULL) ne bloque rien.
-- Le code (upsertOAuthConnection) vérifie avant d'écrire et traduit une violation concurrente en
-- message explicite (« ce compte eBay est déjà relié à une autre organisation »).
--
-- Contrôle préalable : si des doublons existent déjà, la migration ÉCHOUE proprement en listant les
-- comptes concernés (aucune modification) : à résoudre à la main (déconnecter la connexion en trop)
-- avant de la relancer. À la date de l'audit : 0 doublon.
-- Idempotente (create unique index if not exists). Non destructive.
-- Retour arrière : supabase/ops/rollback/20261023000110_channel_connection_account_uniqueness_down.sql
-- =============================================================================

do $pre$
declare
  v_dups text;
begin
  select string_agg(format('%s/%s/%s (%s connexions : %s)', provider, environment, external_account_id, n, ids), ' ; ')
    into v_dups
    from (
      select provider, environment, external_account_id, count(*) as n, string_agg(id::text, ', ' order by created_at) as ids
        from public.channel_connections
       where external_account_id is not null and status <> 'disconnected'
       group by provider, environment, external_account_id
      having count(*) > 1
    ) d;
  if v_dups is not null then
    raise exception 'Contrôle préalable 20261023000110 : comptes marketplace reliés à plusieurs connexions actives : %. Déconnectez les connexions en trop avant de relancer la migration.', v_dups
      using errcode = '23505';
  end if;
end
$pre$;

create unique index if not exists channel_connections_one_active_account_uidx
  on public.channel_connections (provider, environment, external_account_id)
  where external_account_id is not null and status <> 'disconnected';

comment on index public.channel_connections_one_active_account_uidx is
  'Un compte marketplace (par environnement) n''est relié qu''à une seule connexion non déconnectée, toutes organisations confondues (D-04).';
