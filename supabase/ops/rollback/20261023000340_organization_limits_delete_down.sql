-- Retour arrière MANUEL de 20261023000340_organization_limits_delete.sql (D-08).
-- Rétablit la création d'organisations sans limite (corps de 20261007000100/0600) et retire la
-- RPC delete_organization. Les organisations déjà supprimées ne sont PAS restaurées (seule une
-- restauration de sauvegarde le permettrait).

drop function if exists public.delete_organization(uuid, text);

create or replace function public.create_organization_with_owner(p_name text, p_slug text, p_is_demo boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  insert into public.organizations (name, slug, is_demo, created_by)
  values (p_name, p_slug, p_is_demo, v_user)
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
