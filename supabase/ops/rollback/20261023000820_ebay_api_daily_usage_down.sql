-- Retour arrière MANUEL de 20261023000820_ebay_api_daily_usage.sql (I-12).
-- Sans risque pour l'Edge : l'enregistrement du compteur est best effort (une erreur est journalisée,
-- la synchronisation continue). Les lignes supprimées ne sont que des compteurs.
drop function if exists public.ebay_api_usage_add(uuid, integer);
drop table if exists public.ebay_api_usage_daily;
