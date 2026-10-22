-- Retour arrière MANUEL de 20261023000530_advisor_retention_purge.sql.
-- Retire les déclencheurs de purge à la suppression d'un compte eBay, les fonctions de purge et la
-- politique de conservation (les durées configurées sont perdues). Aucune donnée métier touchée.
drop trigger if exists orders_advisor_purge_on_buyer_deleted on public.orders;
drop trigger if exists channel_connections_advisor_purge_on_deleted on public.channel_connections;
drop function if exists public.advisor_purge_on_ebay_account_deleted();
drop function if exists public.advisor_purge_ebay_account(text);
drop function if exists public.advisor_purge_expired(timestamptz);
drop index if exists public.advisor_conversations_last_message_idx;
drop index if exists public.advisor_messages_created_idx;
drop table if exists public.advisor_retention_policy;
