-- =============================================================================
-- MON STOCK — migration 20261023000800 : limitation de débit des routes coûteuses de l'Edge
-- (audit S-15, I-29).
--
-- Avant : POST /ebay/sync, /shipping/quotes et /tracking/refresh n'avaient aucune limite : un membre
-- pouvait enchaîner les synchronisations eBay (quota d'appels de l'application, I-12), épuiser le
-- quota des transporteurs (Sendcloud : 100 requêtes/min par compte, clés partagées par toutes les
-- organisations) ou réinterroger un colis en boucle.
--
-- Après : même mécanisme que le quota IA (migration 20261023000500) : réservation ATOMIQUE en base
-- (compte + insertion sous verrou consultatif, une transaction), exécutable par service_role
-- seulement, limites fixées par le serveur (src/services/rate-limit.ts), jamais par le client.
--   1. api_rate_events : un événement par appel accepté (organisation, utilisateur, catégorie,
--      objet facultatif : connexion, colis). RLS active, AUCUNE politique, aucun droit client.
--   2. api_rate_reserve(...) : refuse si
--        - l'objet a déjà été traité depuis moins de p_subject_min_interval_seconds ('subject_cooldown'),
--        - l'utilisateur a atteint p_user_limit sur p_user_window_seconds ('user_limit'),
--        - l'organisation a atteint p_org_limit sur p_org_window_seconds ('org_limit') ;
--      sinon insère l'événement. Renvoie { allowed, reason, retry_after_seconds }.
--      Les événements de plus de 2 jours de la catégorie sont purgés au passage (table bornée).
--
-- Non destructive et idempotente (create … if not exists, create or replace). Aucune donnée existante
-- touchée. Retour arrière : supabase/ops/rollback/20261023000800_api_rate_limits_down.sql
-- =============================================================================

create table if not exists public.api_rate_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  bucket text not null check (bucket ~ '^[a-z][a-z0-9_]{1,40}$'),
  subject text check (subject is null or length(subject) between 1 and 200),
  created_at timestamptz not null default now()
);

comment on table public.api_rate_events is 'MON STOCK : limitation de débit des routes coûteuses de l''Edge (S-15, I-29). Écrit par api_rate_reserve (service_role) uniquement.';

create index if not exists api_rate_events_user_idx on public.api_rate_events (bucket, user_id, created_at desc);
create index if not exists api_rate_events_org_idx on public.api_rate_events (bucket, organization_id, created_at desc);
create index if not exists api_rate_events_subject_idx on public.api_rate_events (bucket, organization_id, subject, created_at desc) where subject is not null;
create index if not exists api_rate_events_created_idx on public.api_rate_events (created_at);

alter table public.api_rate_events enable row level security;
-- Garde-fou commun : organisation de la ligne = organisation des objets référencés (idempotent).
select public.install_same_org_guards('public.api_rate_events'::regclass);
revoke all on public.api_rate_events from public, anon, authenticated;

create or replace function public.api_rate_reserve(
  p_organization_id uuid,
  p_user_id uuid,
  p_bucket text,
  p_subject text,
  p_subject_min_interval_seconds integer,
  p_user_limit integer,
  p_user_window_seconds integer,
  p_org_limit integer,
  p_org_window_seconds integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count bigint;
  v_oldest timestamptz;
  v_last timestamptz;
begin
  if p_bucket is null or p_bucket !~ '^[a-z][a-z0-9_]{1,40}$' then
    raise exception 'API_RATE_BUCKET_INVALID' using errcode = '22023';
  end if;
  if p_organization_id is null or p_user_id is null then
    raise exception 'API_RATE_SUBJECT_REQUIRED' using errcode = '22023';
  end if;
  if p_subject is not null and length(p_subject) not between 1 and 200 then
    raise exception 'API_RATE_SUBJECT_INVALID' using errcode = '22023';
  end if;

  -- Verrous de transaction, toujours dans le même ordre (organisation puis utilisateur) : deux
  -- demandes simultanées ne peuvent pas lire le même compte et passer toutes les deux.
  perform pg_advisory_xact_lock(hashtextextended('api_rate:org:' || p_bucket || ':' || p_organization_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('api_rate:user:' || p_bucket || ':' || p_user_id::text, 0));

  -- Table bornée : événements anciens de la catégorie purgés (les fenêtres ne dépassent pas 1 jour).
  delete from public.api_rate_events e where e.bucket = p_bucket and e.created_at < now() - interval '2 days';

  if p_subject is not null and p_subject_min_interval_seconds is not null and p_subject_min_interval_seconds > 0 then
    select max(e.created_at) into v_last from public.api_rate_events e
      where e.bucket = p_bucket and e.organization_id = p_organization_id and e.subject = p_subject
        and e.created_at > now() - make_interval(secs => p_subject_min_interval_seconds);
    if v_last is not null then
      return jsonb_build_object('allowed', false, 'reason', 'subject_cooldown',
        'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_last + make_interval(secs => p_subject_min_interval_seconds) - now())))::int));
    end if;
  end if;

  if p_user_limit is not null and p_user_window_seconds is not null then
    select count(*), min(e.created_at) into v_count, v_oldest from public.api_rate_events e
      where e.bucket = p_bucket and e.user_id = p_user_id and e.created_at > now() - make_interval(secs => p_user_window_seconds);
    if v_count >= p_user_limit then
      return jsonb_build_object('allowed', false, 'reason', 'user_limit',
        'retry_after_seconds', greatest(1, ceil(extract(epoch from (coalesce(v_oldest, now()) + make_interval(secs => p_user_window_seconds) - now())))::int));
    end if;
  end if;

  if p_org_limit is not null and p_org_window_seconds is not null then
    select count(*), min(e.created_at) into v_count, v_oldest from public.api_rate_events e
      where e.bucket = p_bucket and e.organization_id = p_organization_id and e.created_at > now() - make_interval(secs => p_org_window_seconds);
    if v_count >= p_org_limit then
      return jsonb_build_object('allowed', false, 'reason', 'org_limit',
        'retry_after_seconds', greatest(1, ceil(extract(epoch from (coalesce(v_oldest, now()) + make_interval(secs => p_org_window_seconds) - now())))::int));
    end if;
  end if;

  insert into public.api_rate_events (organization_id, user_id, bucket, subject)
    values (p_organization_id, p_user_id, p_bucket, p_subject);
  return jsonb_build_object('allowed', true, 'reason', null, 'retry_after_seconds', null);
end;
$$;

revoke all on function public.api_rate_reserve(uuid, uuid, text, text, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.api_rate_reserve(uuid, uuid, text, text, integer, integer, integer, integer, integer) to service_role;

comment on function public.api_rate_reserve(uuid, uuid, text, text, integer, integer, integer, integer, integer) is 'MON STOCK : réservation atomique d''un appel à une route coûteuse (S-15, I-29), service_role uniquement (migration 20261023000800).';
