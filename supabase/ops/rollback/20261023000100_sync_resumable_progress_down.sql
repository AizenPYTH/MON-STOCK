-- Retour arrière MANUEL de 20261023000100_sync_resumable_progress.sql (D-01, S-05, I-03, I-02).
-- À n'exécuter qu'après décision explicite, et APRÈS le retour arrière de 20261023000130 (qui lit
-- sales_stock_cutoff_at) et le redéploiement d'un code qui n'utilise plus ces colonnes.
-- Effets : la progression reprenable (parcours d'annonces en cours, taille des tranches) est perdue
-- (le prochain run repart de la page 1, sans risque : écritures idempotentes) ; la date limite de
-- déduction des ventes (I-02) disparaît : les ventes antérieures à la connexion déduiraient de
-- nouveau le stock lors d'un premier import.
alter table public.channel_connections drop constraint if exists channel_connections_sync_state_object_chk;
alter table public.channel_connections
  drop column if exists sales_stock_cutoff_at,
  drop column if exists last_sync_attempt_at,
  drop column if exists sync_state;
