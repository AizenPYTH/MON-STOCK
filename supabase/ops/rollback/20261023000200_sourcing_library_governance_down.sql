-- Retour arrière MANUEL de 20261023000200_sourcing_library_governance.sql.
-- Supprime la garde « validation humaine » et les colonnes de traçabilité. Les traces de
-- validation enregistrées (auteur, date, page des conditions) sont PERDUES : exportez-les avant
-- (select id, organization_id, access_reviewed_by, access_reviewed_at, terms_url, terms_status
--  from public.supplier_sources where access_reviewed_by is not null).
-- À n'exécuter qu'après décision explicite.
drop trigger if exists supplier_sources_require_library_review on public.supplier_sources;
drop function if exists public.supplier_sources_require_library_review();

alter table public.supplier_sources
  drop constraint if exists supplier_sources_terms_status_check,
  drop constraint if exists supplier_sources_terms_url_check,
  drop column if exists terms_status,
  drop column if exists terms_url,
  drop column if exists access_reviewed_at,
  drop column if exists access_reviewed_by;

alter table public.sourcing_library_checks
  drop column if exists last_attempt_at;
