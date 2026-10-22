-- Retour arrière MANUEL de 20261023000110_channel_connection_account_uniqueness.sql (D-04, I-07).
-- À n'exécuter qu'après décision explicite. Effet : un même compte eBay peut de nouveau être relié à
-- plusieurs organisations (le contrôle applicatif d'upsertOAuthConnection reste en place, mais deux
-- callbacks concurrents ne sont plus départagés par la base).
drop index if exists public.channel_connections_one_active_account_uidx;
