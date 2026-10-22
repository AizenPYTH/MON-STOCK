-- =============================================================================
-- MON STOCK — migration 20261023000600 : suppression de compte initiée par l'utilisateur
-- (audit 2026-10-22 : M-01 / Q-04, règle App Store 5.1.1(v)).
--
-- Appelées UNIQUEMENT par le serveur (service_role), depuis le service
-- src/services/account/delete-account.ts (route Edge POST /account/delete) après revalidation du
-- jeton de l'utilisateur et confirmation explicite. Aucun client (anon / authenticated) ne peut
-- les exécuter : l'identité vient du jeton vérifié par le serveur, jamais d'un paramètre client.
--
-- 1. account_deletion_plan(p_user_id) : lecture seule. Pour chaque organisation de l'utilisateur :
--    rôle, nombre d'autres membres et d'autres propriétaires, présence de commandes, connexions
--    actives (identifiants des connexions de vente, pour tenter une révocation distante).
-- 2. delete_account_organization(p_user_id, p_organization_id) : procédure dédiée, utilisée quand
--    les garde-fous de delete_organization (commandes, connexion active) bloquent. Exige que
--    l'utilisateur soit le SEUL membre (verrou de l'organisation : un membre ajouté entre le plan
--    et la suppression fait échouer l'appel). Déconnexion LOCALE (secrets chiffrés supprimés,
--    statut « disconnected ») sans révocation distante — la tentative de révocation distante est
--    faite avant par le service quand elle est possible — puis suppression de l'organisation
--    (cascade : stock, journal, commandes, conversations…). Idempotente : organisation déjà
--    supprimée → { deleted: false, reason: 'not_found' }.
-- 3. delete_account_data(p_user_id) : refuse s'il reste une organisation dont l'utilisateur est le
--    seul membre (ACCOUNT_ORGANIZATIONS_REMAIN) ou le seul propriétaire avec d'autres membres
--    (ACCOUNT_SOLE_OWNER) ; sinon purge ses conversations du conseiller, retire ses adhésions et
--    supprime son profil. Idempotente. L'utilisateur d'authentification est supprimé ENSUITE par
--    l'API d'administration de Supabase Auth (cascade sur les données restantes liées à auth.users).
--
-- Données existantes : aucune modifiée par la migration. Retour arrière :
-- supabase/ops/rollback/20261023000600_account_deletion_down.sql
-- =============================================================================

do $pre$
begin
  if to_regprocedure('public.delete_organization(uuid, text)') is null then
    raise exception 'Contrôle préalable 20261023000600 : delete_organization(uuid, text) absente (migration 20261023000340 requise).';
  end if;
  if to_regclass('public.channel_connection_secrets') is null or to_regclass('public.supplier_connection_secrets') is null then
    raise exception 'Contrôle préalable 20261023000600 : tables de secrets de connexion absentes.';
  end if;
  if to_regclass('public.advisor_conversations') is null then
    raise exception 'Contrôle préalable 20261023000600 : advisor_conversations absente.';
  end if;
end
$pre$;

-- 1. Plan ------------------------------------------------------------------------------------
create or replace function public.account_deletion_plan(p_user_id uuid)
returns table (
  organization_id uuid,
  organization_name text,
  role public.org_role,
  is_demo boolean,
  other_members integer,
  other_owners integer,
  has_orders boolean,
  active_channel_connection_ids uuid[],
  active_supplier_connections integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    o.id,
    o.name,
    m.role,
    o.is_demo,
    (select count(*)::integer from public.organization_members x where x.organization_id = o.id and x.user_id <> p_user_id),
    (select count(*)::integer from public.organization_members x where x.organization_id = o.id and x.user_id <> p_user_id and x.role = 'owner'),
    exists (select 1 from public.orders d where d.organization_id = o.id),
    coalesce((select array_agg(c.id order by c.created_at) from public.channel_connections c where c.organization_id = o.id and c.status <> 'disconnected'), '{}'::uuid[]),
    (select count(*)::integer from public.supplier_connections s where s.organization_id = o.id and s.status <> 'disconnected')
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = p_user_id
  order by o.name, o.id;
$$;

revoke all on function public.account_deletion_plan(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_plan(uuid) to service_role;

comment on function public.account_deletion_plan(uuid) is
  'M-01 : organisations d''un compte à supprimer (rôle, autres membres/propriétaires, commandes, connexions actives). service_role uniquement.';

-- 2. Suppression d'une organisation dont l'utilisateur est le seul membre ------------------------
create or replace function public.delete_account_organization(p_user_id uuid, p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org public.organizations;
  v_is_member boolean;
  v_channels integer := 0;
  v_suppliers integer := 0;
begin
  if p_user_id is null or p_organization_id is null then
    raise exception 'ACCOUNT_DELETE_INVALID' using errcode = '22023';
  end if;

  select * into v_org from public.organizations where id = p_organization_id for update;
  if v_org.id is null then
    return jsonb_build_object('deleted', false, 'reason', 'not_found', 'organization_id', p_organization_id);
  end if;

  select true into v_is_member from public.organization_members
  where organization_id = p_organization_id and user_id = p_user_id;
  if v_is_member is null then
    raise exception 'ORGANIZATION_NOT_MEMBER' using errcode = '42501';
  end if;
  if exists (select 1 from public.organization_members m where m.organization_id = p_organization_id and m.user_id <> p_user_id) then
    raise exception 'ORGANIZATION_HAS_MEMBERS' using errcode = '55000';
  end if;

  -- Déconnexion locale : secrets chiffrés supprimés, connexions marquées déconnectées (aucun appel
  -- distant possible depuis la base ; la révocation distante est tentée avant par le serveur).
  delete from public.channel_connection_secrets s
    using public.channel_connections c
    where s.connection_id = c.id and c.organization_id = p_organization_id;
  update public.channel_connections
    set status = 'disconnected', disconnected_at = now(), token_expires_at = null, refresh_token_expires_at = null
    where organization_id = p_organization_id and status <> 'disconnected';
  get diagnostics v_channels = row_count;

  delete from public.supplier_connection_secrets s
    using public.supplier_connections c
    where s.connection_id = c.id and c.organization_id = p_organization_id;
  update public.supplier_connections
    set status = 'disconnected'
    where organization_id = p_organization_id and status <> 'disconnected';
  get diagnostics v_suppliers = row_count;

  delete from public.organizations where id = p_organization_id;

  return jsonb_build_object(
    'deleted', true,
    'organization_id', p_organization_id,
    'channel_connections_disconnected', v_channels,
    'supplier_connections_disconnected', v_suppliers
  );
end;
$$;

revoke all on function public.delete_account_organization(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_account_organization(uuid, uuid) to service_role;

comment on function public.delete_account_organization(uuid, uuid) is
  'M-01 : suppression de compte — organisation dont l''utilisateur est le seul membre, malgré commandes ou connexions (déconnexion locale puis cascade). service_role uniquement.';

-- 3. Données personnelles, adhésions et profil -------------------------------------------------
create or replace function public.delete_account_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conversations integer := 0;
  v_memberships integer := 0;
  v_profile integer := 0;
begin
  if p_user_id is null then
    raise exception 'ACCOUNT_DELETE_INVALID' using errcode = '22023';
  end if;

  -- Sérialise avec une autre suppression du même compte (double appui, deux appareils).
  perform pg_advisory_xact_lock(hashtextextended('mon_stock.delete_account:' || p_user_id::text, 0));

  if exists (
    select 1 from public.organization_members m
    where m.user_id = p_user_id
      and not exists (select 1 from public.organization_members x where x.organization_id = m.organization_id and x.user_id <> p_user_id)
  ) then
    raise exception 'ACCOUNT_ORGANIZATIONS_REMAIN' using errcode = '55000';
  end if;

  if exists (
    select 1 from public.organization_members m
    where m.user_id = p_user_id and m.role = 'owner'
      and not exists (select 1 from public.organization_members x where x.organization_id = m.organization_id and x.user_id <> p_user_id and x.role = 'owner')
  ) then
    raise exception 'ACCOUNT_SOLE_OWNER' using errcode = '55000';
  end if;

  -- Conversations du conseiller (messages en cascade) : données personnelles, purgées tout de suite.
  delete from public.advisor_conversations where user_id = p_user_id;
  get diagnostics v_conversations = row_count;

  delete from public.organization_members where user_id = p_user_id;
  get diagnostics v_memberships = row_count;

  delete from public.user_profiles where user_id = p_user_id;
  get diagnostics v_profile = row_count;

  return jsonb_build_object(
    'memberships_removed', v_memberships,
    'profile_deleted', v_profile > 0,
    'advisor_conversations_deleted', v_conversations
  );
end;
$$;

revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;

comment on function public.delete_account_data(uuid) is
  'M-01 : suppression de compte — conversations du conseiller, adhésions et profil, une fois les organisations traitées. service_role uniquement.';
