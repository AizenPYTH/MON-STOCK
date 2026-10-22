-- =============================================================================
-- MON STOCK — migration 20261023000100 : synchronisation eBay bornée et reprenable
-- (audit 2026-10-22 : D-01, S-05, I-03, I-02).
--
-- Incident du 22/10 : la synchronisation du compte réel (3 247 annonces) était tuée par la limite de
-- l'Edge Function AVANT d'enregistrer sa progression (curseur et last_sync_at écrits en fin de run),
-- et repartait du même point à chaque passage du cron. Le moteur s'arrête désormais à une échéance
-- interne et enregistre sa progression après chaque page / tranche confirmée. Ajouts :
--
--   1. channel_connections.sync_state (jsonb, '{}' par défaut) : progression technique reprenable
--      (parcours des annonces en cours : page suivante, début du parcours ; taille adaptative des
--      tranches de commandes). Écrit uniquement par le serveur ; aucune donnée personnelle.
--   2. channel_connections.last_sync_attempt_at : début du dernier run (même interrompu). Le cron
--      sert d'abord les connexions les moins récemment TENTÉES : une connexion qui reprend un long
--      import n'affame pas les autres.
--   3. channel_connections.sales_stock_cutoff_at (I-02) : les ventes passées AVANT cette date sont
--      importées (analyse) mais ne déduisent jamais le stock (le stock saisi à la connexion les
--      reflète déjà). Fixée à la PREMIÈRE connexion du compte et conservée lors des reconnexions
--      (les ventes faites pendant une expiration restent déduites). NULL = pas de date limite
--      (comportement antérieur). Les connexions existantes reçoivent leur date de création (date de
--      la première connexion) : seules des commandes antérieures encore jamais importées sont
--      concernées.
--
-- Non destructive, idempotente (if not exists ; la reprise ne remplit que les valeurs NULL).
-- Retour arrière : supabase/ops/rollback/20261023000100_sync_resumable_progress_down.sql
-- =============================================================================

do $pre$
begin
  if to_regclass('public.channel_connections') is null then
    raise exception 'Contrôle préalable 20261023000100 : table public.channel_connections absente.';
  end if;
end
$pre$;

alter table public.channel_connections
  add column if not exists sync_state jsonb not null default '{}'::jsonb,
  add column if not exists last_sync_attempt_at timestamptz,
  add column if not exists sales_stock_cutoff_at timestamptz;

do $chk$
begin
  if not exists (select 1 from pg_constraint where conname = 'channel_connections_sync_state_object_chk' and conrelid = 'public.channel_connections'::regclass) then
    alter table public.channel_connections
      add constraint channel_connections_sync_state_object_chk check (jsonb_typeof(sync_state) = 'object');
  end if;
end
$chk$;

comment on column public.channel_connections.sync_state is
  'Progression reprenable de la synchronisation (parcours d''annonces en cours, taille des tranches de commandes). Serveur uniquement.';
comment on column public.channel_connections.last_sync_attempt_at is
  'Début du dernier run de synchronisation (même interrompu) : ordre de service du cron.';
comment on column public.channel_connections.sales_stock_cutoff_at is
  'Les ventes passées avant cette date sont importées sans mouvement de stock (I-02). Fixée à la première connexion. NULL = aucune limite.';

-- Reprise : date de la première connexion = création de la ligne (upsertOAuthConnection crée la
-- ligne à la première autorisation et la réutilise ensuite).
update public.channel_connections
   set sales_stock_cutoff_at = created_at
 where sales_stock_cutoff_at is null;
