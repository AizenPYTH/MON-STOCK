-- Retour arrière MANUEL de 20261023000310_rls_initplan_views.sql (D-15, D-18).
-- Rétablit auth.uid() évalué par ligne dans les politiques (ALTER POLICY, seulement si elles
-- existent encore), les deux politiques SELECT de user_profiles, et les privilèges d'écriture
-- d'origine de authenticated sur les vues. Sémantique d'accès identique avant / après.

do $pol$
declare
  r record;
begin
  for r in
    select * from (values
      ('advisor_actions', 'advisor_actions_insert', null,
        '((user_id = auth.uid()) and public.is_org_member(organization_id) and (status = ''pending''::text) and (decided_at is null) and (result is null) and (created_at >= (now() - ''00:01:00''::interval)))'),
      ('advisor_actions', 'advisor_actions_select', '((user_id = auth.uid()) and public.is_org_member(organization_id))', null),
      ('advisor_conversations', 'advisor_conversations_delete', '((user_id = auth.uid()) and public.is_org_member(organization_id))', null),
      ('advisor_conversations', 'advisor_conversations_insert', null, '((user_id = auth.uid()) and public.is_org_member(organization_id))'),
      ('advisor_conversations', 'advisor_conversations_select', '((user_id = auth.uid()) and public.is_org_member(organization_id))', null),
      ('advisor_conversations', 'advisor_conversations_update', '((user_id = auth.uid()) and public.is_org_member(organization_id))', '((user_id = auth.uid()) and public.is_org_member(organization_id))'),
      ('advisor_messages', 'advisor_messages_delete', '((user_id = auth.uid()) and public.is_org_member(organization_id))', null),
      ('advisor_messages', 'advisor_messages_select', '((user_id = auth.uid()) and public.is_org_member(organization_id))', null),
      ('ai_usage_events', 'ai_usage_events_insert', null, '((user_id = auth.uid()) and public.is_org_member(organization_id) and (created_at >= (now() - ''00:01:00''::interval)))'),
      ('ai_usage_events', 'ai_usage_events_select', '((user_id = auth.uid()) or public.is_org_admin(organization_id))', null),
      ('organization_members', 'organization_members_delete',
        '((public.is_org_admin(organization_id) and ((role <> ''owner''::public.org_role) or (public.org_role_of(organization_id) = ''owner''::public.org_role))) or ((user_id = auth.uid()) and (role <> ''owner''::public.org_role)))', null),
      ('organization_members', 'organization_members_update',
        '((user_id <> auth.uid()) and public.is_org_admin(organization_id) and ((role <> ''owner''::public.org_role) or (public.org_role_of(organization_id) = ''owner''::public.org_role)))',
        '((user_id <> auth.uid()) and public.is_org_admin(organization_id) and ((role <> ''owner''::public.org_role) or (public.org_role_of(organization_id) = ''owner''::public.org_role)))'),
      ('user_profiles', 'user_profiles_update_own', '(user_id = auth.uid())', '(user_id = auth.uid())')
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

drop policy if exists user_profiles_select on public.user_profiles;
drop policy if exists user_profiles_select_own on public.user_profiles;
drop policy if exists user_profiles_select_org_members on public.user_profiles;
create policy user_profiles_select_own on public.user_profiles
  for select to authenticated using (user_id = auth.uid());
create policy user_profiles_select_org_members on public.user_profiles
  for select to authenticated using (
    exists (
      select 1
      from public.organization_members me
      join public.organization_members them on them.organization_id = me.organization_id
      where me.user_id = auth.uid() and them.user_id = user_profiles.user_id
    )
  );

-- État d'origine des vues (constaté en production le 22/10/2026) : SELECT, INSERT, UPDATE, DELETE.
do $views$
declare
  v text;
begin
  foreach v in array array['v_stock_overview', 'v_daily_sales', 'v_sku_sales_stats', 'v_unmapped_listings', 'supplier_offers'] loop
    if to_regclass('public.' || v) is not null then
      execute format('grant insert, update, delete on public.%I to authenticated', v);
    end if;
  end loop;
end
$views$;
