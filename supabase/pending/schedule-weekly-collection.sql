-- PROJET À VALIDER — à exécuter APRÈS la migration 20261014000100 ET après le déploiement de la
-- route serveur /cron/sourcing-weekly (sinon le cron appellerait une route inexistante).
-- Toutes les 15 minutes : le serveur reprend au plus 3 collectes dues, 100 s de budget par passage,
-- une requête à la fois par fournisseur. Rien à faire → réponse immédiate.
select cron.schedule('monstock-sourcing-weekly', '*/15 * * * *', $$select public.call_monstock_cron('sourcing-weekly')$$);
