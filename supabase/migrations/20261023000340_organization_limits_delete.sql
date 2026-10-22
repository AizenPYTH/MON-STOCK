-- =============================================================================
-- MON STOCK — migration 20261023000340 : limite de création et suppression contrôlée des
-- organisations (audit 2026-10-22 : D-08).
--
-- 1. create_organization_with_owner (signature inchangée) :
--    - au plus 3 organisations créées par utilisateur sur 24 h glissantes
--      (ORGANIZATION_CREATION_LIMIT) ; créations d'un même utilisateur sérialisées (verrou
--      consultatif transactionnel : double clic, deux onglets) ;
--    - p_is_demo contrôlé : au plus UNE organisation de démonstration existante par utilisateur
--      (DEMO_ORGANIZATION_EXISTS) ; p_is_demo NULL = false.
--    Le reste est identique (owner, canal « Ventes manuelles », organisation courante).
-- 2. delete_organization(p_organization_id, p_confirmation) — NOUVELLE RPC, jamais appelée
--    automatiquement (aucune tâche planifiée, aucun appel serveur) :
--    - réservée au PROPRIÉTAIRE (non-membre : ORGANIZATION_NOT_FOUND, sans divulgation ;
--      admin/member/viewer : FORBIDDEN) ;
--    - confirmation explicite : p_confirmation doit être le nom exact de l'organisation ;
--    - refusée si l'organisation a d'autres membres (ORGANIZATION_HAS_MEMBERS), des commandes
--      (ORGANIZATION_HAS_ORDERS) ou une connexion non déconnectée — canal de vente ou compte
--      fournisseur (ORGANIZATION_HAS_CONNECTION).
--      Exception VOLONTAIRE, à valider par le titulaire : une organisation de DÉMONSTRATION
--      (is_demo) dont toutes les commandes sont fictives (connection_id NULL, jamais importées
--      d'une connexion) reste supprimable ; sans elle, l'unique démo autorisée ne pourrait
--      jamais être remplacée.
--    - la suppression efface EN CASCADE toutes les données de l'organisation (voir D-21 :
--      journal de stock, historiques, conversations IA) : pas d'archive.
--
-- Données existantes : aucune modifiée. En production (22/10/2026), aucun utilisateur n'a créé
-- plus de 3 organisations en 24 h aujourd'hui ; chaque utilisateur a au plus 1 démo (à vérifier
-- avant application : requête dans docs/MIGRATIONS.md).
-- Retour arrière : supabase/ops/rollback/20261023000340_organization_limits_delete_down.sql
-- =============================================================================

-- 0. Contrôles préalables
do $pre$
begin
  if to_regprocedure('public.create_organization_with_owner(text, text, boolean)') is null then
    raise exception 'Contrôle préalable 20261023000340 : create_organization_with_owner(text, text, boolean) absente.';
  end if;
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'organizations'
        and column_name in ('created_by', 'created_at', 'is_demo', 'name')) <> 4 then
    raise exception 'Contrôle préalable 20261023000340 : colonnes attendues de organizations absentes.';
  end if;
end
$pre$;

-- 1. Création limitée -------------------------------------------------------------------------
create or replace function public.create_organization_with_owner(p_name text, p_slug text, p_is_demo boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_recent integer;
  v_is_demo boolean := coalesce(p_is_demo, false);
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  -- Sérialise les créations d'un même utilisateur : le comptage ci-dessous est alors exact.
  perform pg_advisory_xact_lock(hashtextextended('mon_stock.create_organization:' || v_user::text, 0));

  select count(*) into v_recent
  from public.organizations
  where created_by = v_user and created_at > now() - interval '24 hours';
  if v_recent >= 3 then
    raise exception 'ORGANIZATION_CREATION_LIMIT' using errcode = '53400',
      hint = 'Au plus 3 organisations créées par période de 24 heures.';
  end if;

  if v_is_demo and exists (select 1 from public.organizations where created_by = v_user and is_demo) then
    raise exception 'DEMO_ORGANIZATION_EXISTS' using errcode = '23505';
  end if;

  insert into public.organizations (name, slug, is_demo, created_by)
  values (p_name, p_slug, v_is_demo, v_user)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_user, 'owner');

  insert into public.sales_channels (organization_id, provider, name, currency)
  values (v_org, 'manual', 'Ventes manuelles', 'EUR');

  update public.user_profiles
    set current_organization_id = v_org
    where user_id = v_user;

  return v_org;
end;
$$;

revoke all on function public.create_organization_with_owner(text, text, boolean) from public, anon;
grant execute on function public.create_organization_with_owner(text, text, boolean) to authenticated, service_role;

-- 2. Suppression contrôlée ----------------------------------------------------------------------
create or replace function public.delete_organization(p_organization_id uuid, p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_role public.org_role;
  v_org public.organizations;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  v_role := public.org_role_of(p_organization_id);
  if v_role is null then
    raise exception 'ORGANIZATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_role <> 'owner' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_org from public.organizations where id = p_organization_id for update;
  if v_org.id is null then
    raise exception 'ORGANIZATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_confirmation is null or btrim(p_confirmation) <> btrim(v_org.name) then
    raise exception 'ORGANIZATION_DELETE_CONFIRMATION' using errcode = '22023';
  end if;

  if exists (select 1 from public.organization_members m where m.organization_id = v_org.id and m.user_id <> v_user) then
    raise exception 'ORGANIZATION_HAS_MEMBERS' using errcode = '55000';
  end if;

  if exists (
    select 1 from public.orders o
    where o.organization_id = v_org.id
      and not (v_org.is_demo and o.connection_id is null)
  ) then
    raise exception 'ORGANIZATION_HAS_ORDERS' using errcode = '55000';
  end if;

  if exists (select 1 from public.channel_connections c where c.organization_id = v_org.id and c.status <> 'disconnected')
     or exists (select 1 from public.supplier_connections s where s.organization_id = v_org.id and s.status <> 'disconnected') then
    raise exception 'ORGANIZATION_HAS_CONNECTION' using errcode = '55000';
  end if;

  delete from public.organizations where id = v_org.id;

  return jsonb_build_object('deleted', true, 'organization_id', v_org.id);
end;
$$;

revoke all on function public.delete_organization(uuid, text) from public, anon;
grant execute on function public.delete_organization(uuid, text) to authenticated, service_role;

comment on function public.delete_organization(uuid, text) is
  'D-08 : suppression d''une organisation par son propriétaire, sur confirmation du nom exact. Refusée si autres membres, commandes (sauf démo fictive) ou connexion active. Efface tout en cascade.';
