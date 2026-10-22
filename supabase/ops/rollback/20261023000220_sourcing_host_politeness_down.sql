-- Retour arrière MANUEL de 20261023000220_sourcing_host_politeness.sql.
-- Supprime le cache robots.txt partagé et la réservation de créneaux par hôte : la politesse
-- redevient locale à chaque instance (délai minimal en mémoire). Aucune donnée d'organisation.
-- À n'exécuter qu'après décision explicite (le code applicatif correspondant doit être retiré avant).
drop function if exists public.sourcing_reserve_host_slot(text, integer, integer);
drop table if exists public.sourcing_host_policies;
