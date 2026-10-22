-- =============================================================================
-- MON STOCK — migration 20261023000700 : fonction des tâches planifiées versionnée (D-20)
-- -----------------------------------------------------------------------------
-- Avant : public.call_monstock_cron était créée à la main (supabase/ops/schedule-edge-cron.sql)
-- avec l'URL du projet ÉCRITE EN DUR. Une base restaurée ou clonée (préproduction) appelait donc
-- l'Edge Function de PRODUCTION.
--
-- Après : l'URL est lue dans Supabase Vault (secret PROJECT_URL, ex. https://<ref>.supabase.co)
-- à CHAQUE exécution, comme CRON_SECRET. Chaque projet appelle sa propre Edge Function.
-- Aucun secret ni aucune URL de projet dans ce fichier.
--
-- PRÉREQUIS (à faire AVANT d'appliquer, une fois par projet, dans l'éditeur SQL) :
--   select vault.create_secret('https://<ref>.supabase.co', 'PROJECT_URL',
--     'MON STOCK : URL de CE projet, utilisée par public.call_monstock_cron');
--   (CRON_SECRET existe déjà : migration 20261009000400_server_runtime_secrets.)
--
-- Comportement :
--   * pg_cron, pg_net ou Vault absents (PostgreSQL local, CI) → AUCUNE modification (NOTICE) ;
--   * extensions présentes mais PROJECT_URL ou CRON_SECRET absent du Vault → ÉCHEC explicite
--     (on ne remplace pas une fonction qui marche par une fonction qui échouerait à chaque appel) ;
--   * sinon : fonction remplacée (même signature) et 5 tâches planifiées créées ou mises à jour
--     (cron.schedule avec un nom existant met à jour la tâche : idempotent).
--
-- Retour arrière : supabase/ops/rollback/20261023000700_versioned_cron_function_down.sql
-- =============================================================================
do $migration$
declare
  v_missing text[];
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net')
     or to_regclass('vault.decrypted_secrets') is null then
    raise notice 'call_monstock_cron : pg_cron, pg_net ou Vault absent : migration sans effet sur cette base.';
    return;
  end if;

  select array_agg(n order by n) into v_missing
  from unnest(array['PROJECT_URL', 'CRON_SECRET']) as n
  where not exists (select 1 from vault.decrypted_secrets s where s.name = n and coalesce(s.decrypted_secret, '') <> '');
  if v_missing is not null then
    raise exception 'call_monstock_cron : secret(s) Vault manquant(s) : %. Créez-les avant cette migration (voir l''en-tête du fichier).', array_to_string(v_missing, ', ');
  end if;

  execute $fn$
    create or replace function public.call_monstock_cron(p_path text)
    returns bigint
    language plpgsql
    security definer
    set search_path = ''
    as $body$
    declare
      v_base text;
      v_secret text;
    begin
      -- Chemin de route : segments simples uniquement (pas de requête, d'hôte ni de remontée).
      if p_path is null or p_path !~ '^[a-z0-9][a-z0-9-]*(/[a-z0-9][a-z0-9-]*)*$' then
        raise exception 'call_monstock_cron : chemin invalide';
      end if;

      select rtrim(btrim(decrypted_secret), '/') into v_base
      from vault.decrypted_secrets where name = 'PROJECT_URL' limit 1;
      if v_base is null or v_base !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' then
        raise exception 'call_monstock_cron : secret Vault PROJECT_URL absent ou invalide (attendu : https://<ref>.supabase.co)';
      end if;

      select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1;
      if coalesce(v_secret, '') = '' then
        raise exception 'call_monstock_cron : secret Vault CRON_SECRET absent';
      end if;

      return net.http_post(
        url := v_base || '/functions/v1/api/cron/' || p_path,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
        body := '{}'::jsonb,
        timeout_milliseconds := 150000
      );
    end;
    $body$
  $fn$;
  execute 'revoke all on function public.call_monstock_cron(text) from public, anon, authenticated';
  execute 'comment on function public.call_monstock_cron(text) is ''MON STOCK : POST /functions/v1/api/cron/<path> sur le projet désigné par le secret Vault PROJECT_URL (migration 20261023000700).''';

  -- Tâches planifiées (mêmes noms et horaires que supabase/ops/schedule-edge-cron.sql).
  perform cron.schedule('monstock-ebay-sync', '*/15 * * * *', $cmd$select public.call_monstock_cron('sync')$cmd$);
  perform cron.schedule('monstock-sourcing', '7 */6 * * *', $cmd$select public.call_monstock_cron('sourcing')$cmd$);
  perform cron.schedule('monstock-library-checks', '23 4 * * *', $cmd$select public.call_monstock_cron('library-checks')$cmd$);
  perform cron.schedule('monstock-directory-checks', '41 5 * * *', $cmd$select public.call_monstock_cron('directory-checks')$cmd$);
  perform cron.schedule('monstock-tracking', '17,47 * * * *', $cmd$select public.call_monstock_cron('tracking')$cmd$);
end
$migration$;
