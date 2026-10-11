-- Retour arrière MANUEL de 20261011000200_advisor.sql (conseiller IA).
-- Supprime l'historique des conversations du conseiller et les actions préparées : à n'exécuter
-- qu'après décision explicite (aucune autre table n'est touchée).
drop table if exists public.advisor_actions;
drop table if exists public.advisor_messages;
drop table if exists public.advisor_conversations;
