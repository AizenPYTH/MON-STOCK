-- Retour arrière MANUEL de 20261023000800_api_rate_limits.sql (S-15, I-29).
-- À appliquer AVEC le retour arrière de l'Edge Function (ou après) : la version qui limite les routes
-- tolère l'absence de la fonction (elle journalise et laisse passer), mais l'intention est de revenir
-- à l'état sans limitation. Les lignes supprimées ne sont que des compteurs (aucune donnée métier).
drop function if exists public.api_rate_reserve(uuid, uuid, text, text, integer, integer, integer, integer, integer);
drop table if exists public.api_rate_events;
