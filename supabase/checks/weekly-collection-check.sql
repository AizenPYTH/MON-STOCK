-- Vérification LOCALE (jamais en production) de supabase/pending/20261014000100_sourcing_weekly_collection.sql.
-- Usage : base locale (npm run db:local:reset) + migration en attente, puis psql -f ce fichier.
\set ON_ERROR_STOP 1
-- données de test (base LOCALE)
insert into public.organizations (id, name, slug) values ('00000000-0000-0000-0000-0000000000a1', 'Org test', 'org-test-weekly');
insert into public.suppliers (id, organization_id, name) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'Fournisseur test');
insert into public.supplier_sources (id, organization_id, supplier_id, name, source_type, sync_frequency) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'Source test', 'API', 'weekly');
update public.supplier_sources set schedule_weekday = 1, schedule_hour_utc = 3, directory_key = 'refreshed-apples', collection_started_at = now() - interval '1 hour', collect_cursor = '{"cursor":"16","pages":2}' where id = '00000000-0000-0000-0000-0000000000c1';
insert into public.sourcing_offers (organization_id, supplier_id, source_id, source_type, external_offer_id, title_original, original_price, original_currency, last_seen_at, stock_status)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'API', x, 'Offre ' || x, 100, 'EUR',
       case when x in ('vue1','vue2') then now() - interval '10 minutes' else now() - interval '8 days' end, 'in_stock'
from unnest(array['vue1','vue2','absente']) x;

-- 1re collecte complète : 2 vues, 1 absente (compteur 1, PAS expirée)
select * from public.sourcing_close_full_collection('00000000-0000-0000-0000-0000000000c1', now() - interval '1 hour');
select external_offer_id, status, stock_status, missed_collections, missing_since is not null as missing from public.sourcing_offers order by 1;
update public.sourcing_offers set last_seen_at = now() where external_offer_id = 'vue1';
-- 2e collecte complète sans l'offre → expirée, stock inchangé (pas de fausse rupture), jamais supprimée
select * from public.sourcing_close_full_collection('00000000-0000-0000-0000-0000000000c1', now() - interval '1 minute');
select external_offer_id, status, stock_status, missed_collections, expired_at is not null as expired from public.sourcing_offers order by 1;
select count(*) as offres_conservees from public.sourcing_offers;
select collection_started_at is null as cloturee, collect_cursor is null as curseur_vide, last_full_collection_at is not null as complete from public.supplier_sources;

-- sécurité : un utilisateur connecté ne peut pas appeler la fonction
set role authenticated;
do $$ begin perform public.sourcing_close_full_collection('00000000-0000-0000-0000-0000000000c1', now()); raise exception 'ÉCHEC : appel autorisé'; exception when insufficient_privilege then raise notice 'OK : appel refusé à authenticated'; end $$;
reset role;
-- contraintes
do $$ begin update public.supplier_sources set schedule_weekday = 8; raise exception 'ÉCHEC'; exception when check_violation then raise notice 'OK : jour 8 refusé'; end $$;
do $$ begin update public.supplier_sources set collect_cursor = '[1]'; raise exception 'ÉCHEC'; exception when check_violation then raise notice 'OK : curseur non-objet refusé'; end $$;
do $$ begin perform public.sourcing_close_full_collection('00000000-0000-0000-0000-0000000000c1', now() + interval '1 day'); raise exception 'ÉCHEC'; exception when raise_exception then raise notice 'OK : début futur refusé'; end $$;
