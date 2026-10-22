-- =============================================================================
-- MON STOCK — migration 20261023000310 : politiques RLS « initplan » et vues en lecture seule
-- (audit 2026-10-22 : D-15, D-18).
--
-- D-15 : dans les politiques signalées par le conseiller Supabase (auth_rls_initplan),
--        auth.uid() est remplacé par (select auth.uid()) : la valeur est calculée UNE fois par
--        requête au lieu d'une fois par ligne. Sémantique strictement identique (même valeur).
--        Les politiques sont modifiées par ALTER POLICY (jamais recréées) et seulement si elles
--        existent : une politique supprimée ou redéfinie par une autre migration n'est pas
--        ressuscitée. advisor_messages_insert n'est PAS touchée ici : elle est redéfinie par
--        20261023000510_advisor_messages_user_role_only (à aligner dans cette migration-là).
--        user_profiles : les deux politiques SELECT permissives (select_own, select_org_members)
--        sont fusionnées en une seule (user_profiles_select) avec un OR : mêmes lignes visibles.
-- D-18 : les 5 vues (toutes security_invoker) ne sont plus modifiables par les clients :
--        INSERT / UPDATE / DELETE / TRUNCATE / REFERENCES / TRIGGER retirés à authenticated et anon.
--        SELECT conservé. Aucun code n'écrit dans une vue (recherche src/, apps/mobile/src/, server/).
--
-- Non destructive. Retour arrière : supabase/ops/rollback/20261023000310_rls_initplan_views_down.sql
-- =============================================================================

-- 0. Contrôles préalables
do $pre$
begin
  if to_regclass('public.user_profiles') is null or to_regclass('public.organization_members') is null then
    raise exception 'Contrôle préalable 20261023000310 : tables user_profiles / organization_members absentes.';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and policyname in ('user_profiles_select_own', 'user_profiles_select'))
  then
    raise exception 'Contrôle préalable 20261023000310 : politique SELECT de user_profiles introuvable (état inattendu).';
  end if;
end
$pre$;

-- 1. D-15 : (select auth.uid()) -----------------------------------------------------------------
do $pol$
declare
  r record;
begin
  for r in
    select * from (values
      ('advisor_actions', 'advisor_actions_insert', null,
        '((user_id = (select auth.uid())) and public.is_org_member(organization_id) and (status = ''pending''::text) and (decided_at is null) and (result is null) and (created_at >= (now() - ''00:01:00''::interval)))'),
      ('advisor_actions', 'advisor_actions_select',
        '((user_id = (select auth.uid())) and public.is_org_member(organization_id))', null),
      ('advisor_conversations', 'advisor_conversations_delete',
        '((user_id = (select auth.uid())) and public.is_org_member(organization_id))', null),
      ('advisor_conversations', 'advisor_conversations_insert', null,
        '((user_id = (select auth.uid())) and public.is_org_member(organization_id))'),
      ('advisor_conversations', 'advisor_conversations_select',
        '((user_id = (select auth.uid())) and public.is_org_member(organization_id))', null),
      ('advisor_conversations', 'advisor_conversations_update',
        '((user_id = (select auth.uid())) and public.is_org_member(organization_id))',
        '((user_id = (select auth.uid())) and public.is_org_member(organization_id))'),
      ('advisor_messages', 'advisor_messages_delete',
        '((user_id = (select auth.uid())) and public.is_org_member(organization_id))', null),
      ('advisor_messages', 'advisor_messages_select',
        '((user_id = (select auth.uid())) and public.is_org_member(organization_id))', null),
      ('ai_usage_events', 'ai_usage_events_insert', null,
        '((user_id = (select auth.uid())) and public.is_org_member(organization_id) and (created_at >= (now() - ''00:01:00''::interval)))'),
      ('ai_usage_events', 'ai_usage_events_select',
        '((user_id = (select auth.uid())) or public.is_org_admin(organization_id))', null),
      ('organization_members', 'organization_members_delete',
        '((public.is_org_admin(organization_id) and ((role <> ''owner''::public.org_role) or (public.org_role_of(organization_id) = ''owner''::public.org_role))) or ((user_id = (select auth.uid())) and (role <> ''owner''::public.org_role)))', null),
      ('organization_members', 'organization_members_update',
        '((user_id <> (select auth.uid())) and public.is_org_admin(organization_id) and ((role <> ''owner''::public.org_role) or (public.org_role_of(organization_id) = ''owner''::public.org_role)))',
        '((user_id <> (select auth.uid())) and public.is_org_admin(organization_id) and ((role <> ''owner''::public.org_role) or (public.org_role_of(organization_id) = ''owner''::public.org_role)))'),
      ('user_profiles', 'user_profiles_update_own',
        '(user_id = (select auth.uid()))', '(user_id = (select auth.uid()))')
    ) as t(tbl, pol, using_expr, check_expr)
  loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tbl and policyname = r.pol) then
      execute format('alter policy %I on public.%I%s%s', r.pol, r.tbl,
        case when r.using_expr is null then '' else ' using ' || r.using_expr end,
        case when r.check_expr is null then '' else ' with check ' || r.check_expr end);
    end if;
  end loop;
end
$pol$;

-- user_profiles : une seule politique SELECT (soi-même OU membre d'une organisation commune).
drop policy if exists user_profiles_select on public.user_profiles;
drop policy if exists user_profiles_select_own on public.user_profiles;
drop policy if exists user_profiles_select_org_members on public.user_profiles;
create policy user_profiles_select on public.user_profiles
  for select to authenticated
  using (
    (user_id = (select auth.uid()))
    or exists (
      select 1
      from public.organization_members me
      join public.organization_members them on them.organization_id = me.organization_id
      where me.user_id = (select auth.uid())
        and them.user_id = user_profiles.user_id
    )
  );

-- 2. D-18 : vues en lecture seule pour les clients ------------------------------------------------
do $views$
declare
  v text;
begin
  foreach v in array array['v_stock_overview', 'v_daily_sales', 'v_sku_sales_stats', 'v_unmapped_listings', 'supplier_offers'] loop
    if to_regclass('public.' || v) is not null then
      execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated, anon', v);
    end if;
  end loop;
end
$views$;
