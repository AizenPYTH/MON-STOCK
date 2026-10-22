-- Retour arrière MANUEL de 20261023000700_versioned_cron_function.sql (D-20).
-- Rétablit l'ancienne définition de public.call_monstock_cron (URL du projet écrite dans la
-- fonction, CRON_SECRET toujours lu dans le Vault), telle que dans supabase/ops/schedule-edge-cron.sql.
-- Les 5 tâches planifiées gardent les mêmes noms, horaires et commandes : rien à défaire de ce côté.
-- Le secret Vault PROJECT_URL peut rester (inoffensif) ; le supprimer est facultatif :
--   delete from vault.secrets where name = 'PROJECT_URL';
--
-- À n'exécuter qu'après décision explicite, en remplaçant <PROJECT_REF> par la référence du projet
-- VISÉ (celui sur lequel on exécute ce script). Le bloc refuse de s'exécuter si le marqueur est resté.
do $rollback$
declare
  v_ref constant text := '<PROJECT_REF>';
begin
  if v_ref !~ '^[a-z0-9]{20}$' then
    raise exception 'Remplacez <PROJECT_REF> par la référence du projet (20 caractères a-z0-9) avant d''exécuter ce retour arrière.';
  end if;
  if to_regclass('vault.decrypted_secrets') is null or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'Vault ou pg_net absent : rien à restaurer sur cette base.';
    return;
  end if;
  execute format($fn$
    create or replace function public.call_monstock_cron(p_path text)
    returns bigint
    language sql
    security definer
    set search_path = ''
    as $body$
      select net.http_post(
        url := %L || p_path,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 150000
      );
    $body$
  $fn$, 'https://' || v_ref || '.supabase.co/functions/v1/api/cron/');
  execute 'revoke all on function public.call_monstock_cron(text) from public, anon, authenticated';
  execute 'comment on function public.call_monstock_cron(text) is null';
end
$rollback$;
