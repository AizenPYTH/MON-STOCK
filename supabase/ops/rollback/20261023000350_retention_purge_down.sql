-- Retour arrière MANUEL de 20261023000350_retention_purge.sql (D-10).
-- Supprime la fonction de purge. Les données déjà purgées ne sont PAS restaurées (seule une
-- restauration de sauvegarde le permettrait). Si une tâche pg_cron appelle la fonction,
-- la retirer d'abord : select cron.unschedule('<nom de la tâche>');
drop function if exists public.purge_retention(boolean, integer, integer, integer, integer, integer, integer, integer);
