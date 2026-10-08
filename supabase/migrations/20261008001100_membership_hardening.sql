-- =============================================================================
-- MON STOCK — migration 20261008001100 : profils, membres, invitations, organisations
-- -----------------------------------------------------------------------------
-- Constats de l'audit :
--   [CRITIQUE] user_profiles_update_own autorisait la mise à jour de TOUTES les colonnes,
--              y compris `email`. accept_invitation comparait l'invitation à
--              user_profiles.email : n'importe quel compte pouvait réécrire son email
--              puis accepter une invitation destinée à quelqu'un d'autre (et obtenir
--              son rôle, y compris owner).
--   [MAJEUR]   current_organization_id pouvait pointer vers une organisation dont
--              l'utilisateur n'est pas membre (seule la FK était vérifiée).
--   [MAJEUR]   Le dernier propriétaire pouvait être retiré/rétrogradé (organisation
--              orpheline) : la règle n'existait que dans la Server Action.
--   [MAJEUR]   Un admin pouvait modifier user_id / organization_id d'une ligne de
--              organization_members (UPDATE toutes colonnes) : ajout arbitraire d'un
--              utilisateur, déplacement entre organisations.
--   [MINEUR]   Un utilisateur pouvait modifier son propre rôle (admin → member, owner
--              → admin alors qu'il est le dernier owner…).
--   [MINEUR]   Un admin pouvait forcer token / expires_at / accepted_at / invited_by
--              d'une invitation, et modifier slug / is_demo / created_by de l'organisation.
--   [MAJEUR]   sales_channels : tout membre pouvait créer/modifier/supprimer un canal ;
--              la suppression cascade sur channel_connections et leurs secrets
--              (déconnexion eBay par un simple membre).
-- Idempotent : create or replace / drop ... if exists.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. user_profiles : seules full_name et current_organization_id sont modifiables.
--    L'email est un miroir de auth.users, maintenu par trigger.
-- -----------------------------------------------------------------------------
revoke insert, update, delete on table public.user_profiles from authenticated;
grant update (full_name, current_organization_id) on table public.user_profiles to authenticated;

create or replace function public.enforce_profile_current_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.current_organization_id is not null
     and (tg_op = 'INSERT' or new.current_organization_id is distinct from old.current_organization_id)
     and not exists (
       select 1 from public.organization_members m
       where m.organization_id = new.current_organization_id and m.user_id = new.user_id
     ) then
    raise exception 'ORGANIZATION_NOT_MEMBER' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists user_profiles_enforce_current_org on public.user_profiles;
create trigger user_profiles_enforce_current_org
  before insert or update of current_organization_id on public.user_profiles
  for each row execute function public.enforce_profile_current_org();

-- Miroir de l'email : suit les changements d'email confirmés côté Supabase Auth.
create or replace function public.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_profiles
    set email = coalesce(new.email, '')
    where user_id = new.id and email is distinct from coalesce(new.email, '');
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_auth_user_email_change();

-- -----------------------------------------------------------------------------
-- 2. organization_members : seul `role` est modifiable ; jamais son propre rôle ;
--    le dernier propriétaire ne peut être ni retiré ni rétrogradé.
-- -----------------------------------------------------------------------------
revoke insert, update on table public.organization_members from authenticated;
grant update (role) on table public.organization_members to authenticated;

drop policy if exists organization_members_update on public.organization_members;
create policy organization_members_update on public.organization_members
  for update to authenticated
  using (
    user_id <> auth.uid()
    and public.is_org_admin(organization_id)
    and (role <> 'owner' or public.org_role_of(organization_id) = 'owner')
  )
  with check (
    user_id <> auth.uid()
    and public.is_org_admin(organization_id)
    and (role <> 'owner' or public.org_role_of(organization_id) = 'owner')
  );

create or replace function public.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role <> 'owner' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' then
    return new;
  end if;
  -- Suppression en cascade (organisation ou compte supprimé) : rien à protéger.
  if not exists (select 1 from public.organizations where id = old.organization_id)
     or not exists (select 1 from auth.users where id = old.user_id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- Sérialise les changements de propriétaires d'une même organisation (deux owners
  -- qui se rétrograderaient mutuellement en parallèle).
  perform 1 from public.organizations where id = old.organization_id for update;
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = old.organization_id
      and m.role = 'owner'
      and m.user_id <> old.user_id
  ) then
    raise exception 'LAST_OWNER' using errcode = '42501',
      hint = 'Désignez un autre propriétaire avant de retirer ou rétrograder le dernier.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists organization_members_protect_last_owner on public.organization_members;
create trigger organization_members_protect_last_owner
  before update of role or delete on public.organization_members
  for each row execute function public.protect_last_owner();

-- Un membre retiré ne garde pas cette organisation comme organisation courante.
create or replace function public.clear_current_org_on_member_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_profiles
    set current_organization_id = null
    where user_id = old.user_id and current_organization_id = old.organization_id;
  return old;
end;
$$;

drop trigger if exists organization_members_clear_current_org on public.organization_members;
create trigger organization_members_clear_current_org
  after delete on public.organization_members
  for each row execute function public.clear_current_org_on_member_delete();

-- -----------------------------------------------------------------------------
-- 3. organization_invitations : le client choisit organisation, email et rôle ;
--    token, expiration, acceptation et auteur sont imposés par la base.
-- -----------------------------------------------------------------------------
revoke insert, update on table public.organization_invitations from authenticated;
grant insert (organization_id, email, role, invited_by) on table public.organization_invitations to authenticated;

create or replace function public.normalize_invitation()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(new.email));
  if new.email !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'INVITATION_EMAIL_INVALID' using errcode = '22023';
  end if;
  if auth.uid() is not null then
    new.invited_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists organization_invitations_normalize on public.organization_invitations;
create trigger organization_invitations_normalize
  before insert on public.organization_invitations
  for each row execute function public.normalize_invitation();

-- Acceptation : l'email de référence est celui de Supabase Auth (auth.users), jamais
-- une colonne modifiable par l'utilisateur ; l'email doit être confirmé lorsque la
-- colonne email_confirmed_at existe (Supabase).
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_auth jsonb;
  v_inv public.organization_invitations;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select to_jsonb(u) into v_auth from auth.users u where u.id = v_user;
  if v_auth is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if v_auth ? 'email_confirmed_at' and v_auth ->> 'email_confirmed_at' is null then
    raise exception 'INVITATION_EMAIL_NOT_CONFIRMED' using errcode = '42501';
  end if;

  select * into v_inv
  from public.organization_invitations
  where token = p_token
    and accepted_at is null
    and expires_at > now()
  for update;

  if v_inv.id is null then
    raise exception 'INVITATION_INVALID' using errcode = 'P0002';
  end if;

  if lower(trim(v_inv.email)) <> lower(trim(coalesce(v_auth ->> 'email', ''))) then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = 'P0003';
  end if;

  -- Un membre déjà présent conserve son rôle : une invitation ne peut ni rétrograder ni promouvoir.
  insert into public.organization_members (organization_id, user_id, role)
  values (v_inv.organization_id, v_user, v_inv.role)
  on conflict (organization_id, user_id) do nothing;

  update public.organization_invitations
    set accepted_at = now()
    where id = v_inv.id;

  update public.user_profiles
    set current_organization_id = v_inv.organization_id
    where user_id = v_user;

  return v_inv.organization_id;
end;
$$;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. organizations : un admin ne modifie que les paramètres métier.
-- -----------------------------------------------------------------------------
revoke insert, update, delete on table public.organizations from authenticated;
grant update (name, country, default_currency, settings) on table public.organizations to authenticated;

-- -----------------------------------------------------------------------------
-- 5. sales_channels : gestion réservée aux admins (les connexions OAuth créent leurs
--    canaux côté serveur ; create_organization_with_owner crée le canal manuel).
-- -----------------------------------------------------------------------------
drop policy if exists sales_channels_insert on public.sales_channels;
drop policy if exists sales_channels_update on public.sales_channels;
drop policy if exists sales_channels_delete on public.sales_channels;
create policy sales_channels_insert on public.sales_channels
  for insert to authenticated with check (public.is_org_admin(organization_id));
create policy sales_channels_update on public.sales_channels
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy sales_channels_delete on public.sales_channels
  for delete to authenticated using (public.is_org_admin(organization_id));

-- Les nouvelles fonctions ne sont pas exposées à anon.
revoke execute on function public.enforce_profile_current_org() from public, anon;
revoke execute on function public.handle_auth_user_email_change() from public, anon;
revoke execute on function public.protect_last_owner() from public, anon;
revoke execute on function public.clear_current_org_on_member_delete() from public, anon;
revoke execute on function public.normalize_invitation() from public, anon;
