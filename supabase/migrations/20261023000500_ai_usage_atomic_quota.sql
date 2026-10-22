-- =============================================================================
-- MON STOCK — migration 20261023000500 : quota IA atomique, « fail-closed », réservé au serveur
-- (audit S-09, S-10, I-14, S-23).
--
-- Avant : le quota était compté puis inséré en deux requêtes (TOCTOU), un échec de lecture laissait
-- passer la demande, une question = 1 unité pour jusqu'à 8 appels modèle, la synthèse vocale était
-- hors quota (limite en mémoire par instance) et un membre pouvait insérer lui-même des lignes
-- (épuiser le quota de son organisation).
--
-- Après :
--   1. ai_usage_events : nouveaux types 'model_call' (chaque appel au modèle) et 'speech' (synthèse
--      vocale) ; jetons consommés (input_tokens / output_tokens) enregistrés par appel.
--   2. INSERTION RÉSERVÉE AU SERVEUR : la politique d'insertion et le droit INSERT des utilisateurs
--      sont retirés ; la lecture (ses propres lignes, ou celles de l'organisation pour un admin) reste.
--   3. ai_reserve_usage(...) : compte ET réserve sous verrou (utilisateur puis organisation), en une
--      transaction. Exécutable par service_role seulement. Le serveur refuse la demande si l'appel
--      échoue (fail-closed, côté TypeScript).
--   4. ai_record_usage_tokens(...) : enregistre une seule fois les jetons d'un appel réservé.
--
-- Non destructive : colonnes ajoutées nullables, contrainte de type élargie, aucune ligne modifiée.
-- Contrôle avant production : aucun client (web, mobile) n'insère dans ai_usage_events (vérifié :
-- seules les routes de l'Edge Function écrivent ; le web lit le compte horaire « assistant »).
-- Retour arrière : supabase/ops/rollback/20261023000500_ai_usage_atomic_quota_down.sql
-- =============================================================================

alter table public.ai_usage_events add column if not exists input_tokens integer check (input_tokens is null or input_tokens >= 0);
alter table public.ai_usage_events add column if not exists output_tokens integer check (output_tokens is null or output_tokens >= 0);

alter table public.ai_usage_events drop constraint if exists ai_usage_events_kind_check;
alter table public.ai_usage_events add constraint ai_usage_events_kind_check check (kind in ('assistant', 'product_draft', 'model_call', 'speech'));

create index if not exists ai_usage_events_org_kind_idx on public.ai_usage_events (organization_id, kind, created_at desc);
create index if not exists ai_usage_events_user_kind_idx on public.ai_usage_events (user_id, kind, created_at desc);

-- Insertion : serveur uniquement (service_role contourne la RLS ; plus aucun droit pour authenticated).
drop policy if exists ai_usage_events_insert on public.ai_usage_events;
revoke insert, update, delete on public.ai_usage_events from authenticated, anon;
grant select on public.ai_usage_events to authenticated;

-- -----------------------------------------------------------------------------
-- Réservation atomique
-- -----------------------------------------------------------------------------
-- Paramètres (fixés par le serveur, jamais par le client) :
--   p_user_limit / p_user_window_seconds     : plafond de l'utilisateur pour CE type (null = aucun)
--   p_burst_limit / p_burst_window_seconds   : rafale de l'utilisateur pour CE type (null = aucun)
--   p_org_limit / p_org_window_seconds / p_org_kinds : plafond de l'organisation sur ces types
--   p_org_token_limit                         : jetons consommés par l'organisation sur 24 h (null = aucun)
-- Résultat : { allowed, reason ('not_member' | 'user_limit' | 'burst_limit' | 'org_limit' | 'org_tokens'), event_id }.
create or replace function public.ai_reserve_usage(
  p_organization_id uuid,
  p_user_id uuid,
  p_kind text,
  p_user_limit integer,
  p_user_window_seconds integer,
  p_org_limit integer,
  p_org_window_seconds integer,
  p_org_kinds text[],
  p_org_token_limit bigint default null,
  p_burst_limit integer default null,
  p_burst_window_seconds integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count bigint;
  v_tokens bigint;
  v_id uuid;
begin
  if p_kind is null or p_kind not in ('assistant', 'product_draft', 'model_call', 'speech') then
    raise exception 'AI_USAGE_KIND_INVALID' using errcode = '22023';
  end if;
  if p_organization_id is null or p_user_id is null then
    raise exception 'AI_USAGE_SUBJECT_REQUIRED' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organization_members m where m.organization_id = p_organization_id and m.user_id = p_user_id) then
    return jsonb_build_object('allowed', false, 'reason', 'not_member', 'event_id', null);
  end if;

  -- Verrous de transaction, toujours dans le même ordre (utilisateur puis organisation) : deux
  -- demandes simultanées ne peuvent pas lire le même compte et passer toutes les deux.
  perform pg_advisory_xact_lock(hashtextextended('ai_usage:user:' || p_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('ai_usage:org:' || p_organization_id::text, 0));

  if p_burst_limit is not null and p_burst_window_seconds is not null then
    select count(*) into v_count from public.ai_usage_events e
      where e.user_id = p_user_id and e.kind = p_kind and e.created_at > now() - make_interval(secs => p_burst_window_seconds);
    if v_count >= p_burst_limit then
      return jsonb_build_object('allowed', false, 'reason', 'burst_limit', 'event_id', null);
    end if;
  end if;

  if p_user_limit is not null and p_user_window_seconds is not null then
    select count(*) into v_count from public.ai_usage_events e
      where e.user_id = p_user_id and e.kind = p_kind and e.created_at > now() - make_interval(secs => p_user_window_seconds);
    if v_count >= p_user_limit then
      return jsonb_build_object('allowed', false, 'reason', 'user_limit', 'event_id', null);
    end if;
  end if;

  if p_org_limit is not null and p_org_window_seconds is not null then
    select count(*) into v_count from public.ai_usage_events e
      where e.organization_id = p_organization_id
        and e.kind = any (coalesce(p_org_kinds, array[p_kind]))
        and e.created_at > now() - make_interval(secs => p_org_window_seconds);
    if v_count >= p_org_limit then
      return jsonb_build_object('allowed', false, 'reason', 'org_limit', 'event_id', null);
    end if;
  end if;

  if p_org_token_limit is not null then
    select coalesce(sum(coalesce(e.input_tokens, 0)::bigint + coalesce(e.output_tokens, 0)::bigint), 0) into v_tokens
      from public.ai_usage_events e
      where e.organization_id = p_organization_id and e.created_at > now() - interval '1 day';
    if v_tokens >= p_org_token_limit then
      return jsonb_build_object('allowed', false, 'reason', 'org_tokens', 'event_id', null);
    end if;
  end if;

  insert into public.ai_usage_events (organization_id, user_id, kind)
    values (p_organization_id, p_user_id, p_kind)
    returning id into v_id;
  return jsonb_build_object('allowed', true, 'reason', null, 'event_id', v_id);
end;
$$;

revoke all on function public.ai_reserve_usage(uuid, uuid, text, integer, integer, integer, integer, text[], bigint, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_reserve_usage(uuid, uuid, text, integer, integer, integer, integer, text[], bigint, integer, integer) to service_role;

-- Jetons d'un appel réservé : écrits une seule fois (valeurs bornées), jamais modifiables ensuite.
create or replace function public.ai_record_usage_tokens(p_event_id uuid, p_input_tokens integer, p_output_tokens integer)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  with u as (
    update public.ai_usage_events
       set input_tokens = least(greatest(coalesce(p_input_tokens, 0), 0), 10000000),
           output_tokens = least(greatest(coalesce(p_output_tokens, 0), 0), 10000000)
     where id = p_event_id and input_tokens is null and output_tokens is null
     returning 1
  )
  select exists (select 1 from u);
$$;

revoke all on function public.ai_record_usage_tokens(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_record_usage_tokens(uuid, integer, integer) to service_role;
