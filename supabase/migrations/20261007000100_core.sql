-- =============================================================================
-- MON STOCK — migration 0001 : extensions, helpers, organisations, membres
-- =============================================================================
-- Conventions :
--   * toutes les tables métier portent organization_id (multi-tenant strict)
--   * RLS activée partout (voir migration 0007)
--   * les secrets (tokens OAuth, credentials fournisseurs) vivent dans des
--     tables *_secrets sans aucune policy : accessibles uniquement avec la
--     clé service_role côté serveur, et chiffrés applicativement en plus.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
create extension if not exists "unaccent";

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.org_role as enum ('owner', 'admin', 'member', 'viewer');

-- -----------------------------------------------------------------------------
-- Helpers génériques
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Normalisation texte (accents, casse, espaces) utilisée par les index de recherche.
create or replace function public.normalize_text(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(public.unaccent(coalesce(p, ''))), '\s+', ' ', 'g');
$$;

-- -----------------------------------------------------------------------------
-- Profils utilisateurs (miroir public de auth.users)
-- -----------------------------------------------------------------------------
create table public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  current_organization_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- Création automatique du profil à l'inscription Supabase Auth.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name', ''), '')
  )
  on conflict (user_id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Organisations et membres
-- -----------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  default_currency char(3) not null default 'EUR',
  country char(2),
  -- Mode démonstration : données fictives explicitement identifiées.
  is_demo boolean not null default false,
  -- Paramètres (frais par défaut, etc.). Jamais de secrets ici.
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_idx on public.organization_members (user_id);

-- Second FK vers le profil public : permet les jointures PostgREST (membres → profils).
alter table public.organization_members
  add constraint organization_members_user_profile_fk
  foreign key (user_id) references public.user_profiles (user_id) on delete cascade;

alter table public.user_profiles
  add constraint user_profiles_current_org_fk
  foreign key (current_organization_id) references public.organizations (id) on delete set null;

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role public.org_role not null default 'member',
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index organization_invitations_org_idx on public.organization_invitations (organization_id);
create index organization_invitations_email_idx on public.organization_invitations (lower(email));

-- -----------------------------------------------------------------------------
-- Helpers d'autorisation (utilisés par les policies RLS)
-- -----------------------------------------------------------------------------
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.org_role_of(p_org_id uuid)
returns public.org_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.organization_members m
  where m.organization_id = p_org_id
    and m.user_id = auth.uid()
  limit 1;
$$;

-- Membres pouvant écrire (tout sauf 'viewer').
create or replace function public.can_write_org(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'member')
  );
$$;

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

-- Vrai lorsque l'appel est effectué avec la clé service_role (serveur).
create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role() = 'service_role', false);
$$;

-- -----------------------------------------------------------------------------
-- Création d'organisation : atomique (org + propriétaire + canal manuel)
-- -----------------------------------------------------------------------------
create or replace function public.create_organization_with_owner(
  p_name text,
  p_slug text,
  p_is_demo boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
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

  update public.user_profiles
    set current_organization_id = v_org
    where user_id = v_user;

  return v_org;
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_inv public.organization_invitations;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select email into v_email from public.user_profiles where user_id = v_user;

  select * into v_inv
  from public.organization_invitations
  where token = p_token
    and accepted_at is null
    and expires_at > now()
  for update;

  if v_inv.id is null then
    raise exception 'INVITATION_INVALID' using errcode = 'P0002';
  end if;

  if lower(v_inv.email) <> lower(coalesce(v_email, '')) then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = 'P0003';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_inv.organization_id, v_user, v_inv.role)
  on conflict (organization_id, user_id) do update set role = excluded.role;

  update public.organization_invitations
    set accepted_at = now()
    where id = v_inv.id;

  update public.user_profiles
    set current_organization_id = v_inv.organization_id
    where user_id = v_user;

  return v_inv.organization_id;
end;
$$;
