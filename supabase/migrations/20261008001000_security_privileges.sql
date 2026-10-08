-- =============================================================================
-- MON STOCK — migration 20261008001000 : durcissement des privilèges (audit sécurité pré-bêta)
-- -----------------------------------------------------------------------------
-- Constats :
--   * Les « revoke execute ... from anon » de la migration 0007 étaient sans effet :
--     PostgreSQL accorde EXECUTE à PUBLIC sur toute nouvelle fonction, et anon hérite
--     de PUBLIC. Toutes les fonctions SECURITY DEFINER restaient appelables par anon.
--   * anon (clé publique) détenait tous les privilèges sur toutes les tables et vues :
--     seule la RLS le bloquait. Une table créée sans RLS aurait été lisible sans compte.
--   * TRUNCATE n'est pas soumis à la RLS : il était accordé à anon et authenticated.
--   * fx_rates / webhook_events : écriture réservée au serveur, mais les privilèges
--     INSERT/UPDATE/DELETE restaient accordés (seule l'absence de policy protégeait).
-- Idempotent : uniquement des GRANT/REVOKE.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fonctions : plus rien d'exécutable par PUBLIC / anon dans le schéma public.
-- authenticated et service_role conservent EXECUTE (PostgREST /rpc, policies RLS).
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- Fonctions créées plus tard par les migrations (exécutées en tant que postgres) :
-- pas d'EXECUTE implicite pour PUBLIC ni pour anon.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public grant execute on functions to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Tables et vues : anon n'a besoin d'aucun accès direct (l'inscription/connexion passe
-- par Supabase Auth, pas par PostgREST). Défense en profondeur si une table perd sa RLS.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- TRUNCATE contourne la RLS ; REFERENCES/TRIGGER sont inutiles aux clients.
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;

-- Tables écrites uniquement par le serveur (service_role).
revoke insert, update, delete on table public.fx_rates from authenticated;
revoke insert, update, delete on table public.webhook_events from authenticated;
revoke insert, update, delete on table public.sync_runs from authenticated;
revoke insert, update, delete on table public.sync_errors from authenticated;

-- Tables de secrets : aucun accès client (re-affirmé ; la migration 0007 le faisait déjà).
revoke all on table public.channel_connection_secrets from anon, authenticated;
revoke all on table public.supplier_connection_secrets from anon, authenticated;
revoke all on table public.oauth_states from anon, authenticated;
