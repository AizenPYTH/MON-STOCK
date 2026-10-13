-- =============================================================================
-- MON STOCK — collecte hebdomadaire des prix fournisseurs
-- PROJET À VALIDER : NON APPLIQUÉ. Il sera déplacé dans supabase/migrations/ après accord.
--
-- Additive uniquement : aucune table supprimée, aucune donnée existante modifiée ou effacée.
-- Retour arrière : supabase/ops/rollback/20261014000100_sourcing_weekly_collection_down.sql
-- =============================================================================

-- 1. Fréquence « weekly » ----------------------------------------------------------
-- PostgreSQL ne sait pas retirer une valeur d'un type énuméré : le retour arrière la laisse
-- en place, sans effet (aucune source ne l'utilise plus après le retour arrière).
alter type public.sync_frequency add value if not exists 'weekly';

-- 2. Sources : jour/heure de collecte, reprise par tranches, bilan ---------------------
alter table public.supplier_sources
  -- jour ISO (1 = lundi … 7 = dimanche) et heure UTC ; NULL = choisis par le serveur (répartis)
  add column if not exists schedule_weekday smallint check (schedule_weekday is null or schedule_weekday between 1 and 7),
  add column if not exists schedule_hour_utc smallint check (schedule_hour_utc is null or schedule_hour_utc between 0 and 23),
  -- reprise d'une collecte en cours : { "cursor": "<curseur de l'adaptateur>", "pages": n, "offers": n, "errors": n }
  add column if not exists collect_cursor jsonb,
  -- début de la collecte en cours ; NULL = aucune collecte en cours
  add column if not exists collection_started_at timestamptz,
  -- fin de la dernière collecte COMPLÈTE (catalogue parcouru jusqu'au bout, sans erreur bloquante)
  add column if not exists last_full_collection_at timestamptz,
  -- bilan de la dernière collecte : pages, offres lues, nouvelles, prix modifiés, absentes, erreurs, durée
  add column if not exists last_collection_stats jsonb not null default '{}'::jsonb,
  -- clé de la fiche fournisseur dans l'annuaire / la bibliothèque (ex. « refreshed-apples »)
  add column if not exists directory_key text check (directory_key is null or directory_key ~ '^[a-z0-9][a-z0-9-]{1,79}$');

alter table public.supplier_sources
  drop constraint if exists supplier_sources_collect_cursor_object;
alter table public.supplier_sources
  add constraint supplier_sources_collect_cursor_object check (collect_cursor is null or jsonb_typeof(collect_cursor) = 'object');

create index if not exists supplier_sources_collecting_idx
  on public.supplier_sources (collection_started_at) where collection_started_at is not null;

-- 3. Offres : absence constatée (jamais de suppression) -------------------------------
alter table public.sourcing_offers
  -- première collecte complète où l'offre n'a pas été revue ; NULL = vue à la dernière collecte
  add column if not exists missing_since timestamptz,
  -- nombre de collectes complètes consécutives sans l'offre
  add column if not exists missed_collections smallint not null default 0 check (missed_collections between 0 and 100);

create index if not exists sourcing_offers_source_seen_idx
  on public.sourcing_offers (source_id, last_seen_at) where status in ('active', 'suspicious');

-- 4. Règle de disparition, appelée UNIQUEMENT à la fin d'une collecte complète réussie ----
-- • offre revue pendant la collecte  → compteur remis à zéro ;
-- • offre non revue                  → compteur + 1, missing_since posé ;
-- • 2 collectes complètes sans l'offre → statut « expired » (stock_status inchangé : jamais de
--   fausse rupture). L'offre redevient active d'elle-même si elle réapparaît (upsert existant).
-- Une collecte interrompue, tronquée ou en erreur n'appelle jamais cette fonction.
create or replace function public.sourcing_close_full_collection(p_source_id uuid, p_started_at timestamptz)
returns table (seen integer, missed integer, expired integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select s.organization_id into v_org from public.supplier_sources s where s.id = p_source_id;
  if v_org is null then
    raise exception 'source % introuvable', p_source_id;
  end if;
  if p_started_at is null or p_started_at > now() then
    raise exception 'début de collecte invalide';
  end if;

  update public.sourcing_offers o
     set missed_collections = 0, missing_since = null
   where o.organization_id = v_org and o.source_id = p_source_id
     and o.last_seen_at >= p_started_at
     and (o.missed_collections <> 0 or o.missing_since is not null);
  select count(*)::integer into seen from public.sourcing_offers o
   where o.organization_id = v_org and o.source_id = p_source_id and o.last_seen_at >= p_started_at;

  update public.sourcing_offers o
     set missed_collections = least(o.missed_collections + 1, 100),
         missing_since = coalesce(o.missing_since, now())
   where o.organization_id = v_org and o.source_id = p_source_id
     and o.status in ('active', 'suspicious')
     and o.last_seen_at < p_started_at;
  get diagnostics missed = row_count;

  update public.sourcing_offers o
     set status = 'expired', expired_at = now()
   where o.organization_id = v_org and o.source_id = p_source_id
     and o.status in ('active', 'suspicious')
     and o.missed_collections >= 2;
  get diagnostics expired = row_count;

  update public.supplier_sources s
     set last_full_collection_at = now(), collection_started_at = null, collect_cursor = null
   where s.id = p_source_id;

  return next;
end;
$$;

-- réservée au serveur (clé service) : ni l'application mobile ni un utilisateur ne peut l'appeler
revoke all on function public.sourcing_close_full_collection(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.sourcing_close_full_collection(uuid, timestamptz) to service_role;

comment on function public.sourcing_close_full_collection(uuid, timestamptz) is
  'Clôture une collecte COMPLÈTE : remet à zéro les offres revues, compte les absentes, expire après 2 collectes complètes sans l''offre. Jamais de suppression.';
