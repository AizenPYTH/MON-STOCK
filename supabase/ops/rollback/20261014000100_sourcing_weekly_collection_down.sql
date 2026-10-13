-- Retour arrière MANUEL de 20261014000100_sourcing_weekly_collection.sql (collecte hebdomadaire).
-- Retire la fonction de clôture, les colonnes et index ajoutés. Les offres et les sources restent.
-- La valeur « weekly » du type sync_frequency ne peut pas être retirée par PostgreSQL : les sources
-- qui l'utilisent repassent d'abord en « daily » (aucune source ne perd sa planification).
-- À n'exécuter qu'après décision explicite.
do $$
begin
  if to_regclass('cron.job') is not null then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = ''monstock-sourcing-weekly''';
  end if;
end $$;

update public.supplier_sources set sync_frequency = 'daily' where sync_frequency::text = 'weekly';
update public.supplier_feeds set sync_frequency = 'daily' where sync_frequency::text = 'weekly';

drop function if exists public.sourcing_close_full_collection(uuid, timestamptz);

drop index if exists public.sourcing_offers_source_seen_idx;
alter table public.sourcing_offers
  drop column if exists missed_collections,
  drop column if exists missing_since;

drop index if exists public.supplier_sources_collecting_idx;
alter table public.supplier_sources
  drop constraint if exists supplier_sources_collect_cursor_object,
  drop column if exists directory_key,
  drop column if exists last_collection_stats,
  drop column if exists last_full_collection_at,
  drop column if exists collection_started_at,
  drop column if exists collect_cursor,
  drop column if exists schedule_hour_utc,
  drop column if exists schedule_weekday;
