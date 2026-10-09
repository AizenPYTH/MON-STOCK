-- =============================================================================
-- MON STOCK — migration 20261009000300 : vérifications en direct de la bibliothèque de sources
-- -----------------------------------------------------------------------------
-- La bibliothèque de sources (src/services/sourcing/source-library.ts) liste des fournisseurs
-- spécialisés candidats. Une source n'est proposée à l'activation que si une VÉRIFICATION RÉELLE
-- a réussi depuis le serveur : robots.txt autorisant les chemins utilisés ET endpoint public
-- renvoyant des produits avec prix. Le résultat de chaque vérification est conservé ici (preuve :
-- statut HTTP, nombre de produits, exemples titre/prix), écrit uniquement par le serveur.
--
-- Données de plateforme (aucune donnée d'organisation) : lisibles par tout utilisateur connecté,
-- jamais modifiables par un client.
-- =============================================================================

create table public.sourcing_library_checks (
  key text primary key check (char_length(key) between 1 and 80),
  checked_at timestamptz not null default now(),
  -- ok : robots.txt autorise + produits avec prix obtenus ; les autres statuts expliquent le refus
  status text not null check (status in ('ok', 'robots_disallowed', 'no_products', 'http_error', 'unreachable', 'not_configured')),
  adapter text,
  robots_allowed boolean,
  http_status integer,
  product_count integer,
  sample jsonb not null default '[]'::jsonb,
  message text,
  duration_ms integer
);

alter table public.sourcing_library_checks enable row level security;

create policy sourcing_library_checks_read on public.sourcing_library_checks
  for select to authenticated using (true);

revoke all on public.sourcing_library_checks from anon, authenticated;
grant select on public.sourcing_library_checks to authenticated;
grant all on public.sourcing_library_checks to service_role;
