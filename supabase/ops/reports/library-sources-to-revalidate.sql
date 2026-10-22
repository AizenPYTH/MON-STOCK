-- =============================================================================
-- MON STOCK — RAPPORT (lecture seule) : sources de la bibliothèque ACTIVES à faire revalider par
-- le titulaire du compte (audit 2026-10-22 : I-05 / Q-19).
--
-- Ne modifie et ne désactive RIEN : la décision de désactiver une source appartient au titulaire.
-- Équivalent applicatif : POST /api/cron/library-review-report (CRON_SECRET), ou
-- librarySourcesToRevalidate() dans src/services/sourcing/source-library.ts.
--
-- Motifs :
--   - aucune validation humaine tracée (access_reviewed_by / access_reviewed_at absents) ;
--   - attestation générée par l'ancienne route planifiée /cron/library-activate (supprimée) ;
--   - page des conditions non confirmée par MON STOCK (seules eBay et Utopya ont une preuve ;
--     Utopya est bloquée et n'est jamais activable).
-- Les colonnes access_reviewed_* / terms_* sont créées par la migration 20261023000200.
-- =============================================================================
select
  s.organization_id,
  o.name as organisation,
  s.id as source_id,
  s.config ->> 'library_key' as library_key,
  s.name,
  s.status,
  s.created_at,
  s.access_reviewed_by,
  s.access_reviewed_at,
  s.terms_url,
  coalesce(s.terms_status, case when s.config ->> 'library_key' in ('ebay-fr') then 'confirmed' else 'unverified' end) as terms_status,
  array_remove(array[
    case when s.access_reviewed_by is null or s.access_reviewed_at is null then 'aucune validation humaine tracée (utilisateur, date)' end,
    case when s.access_conditions ~ '(robots\.txt vérifié par le serveur|Activation enregistrée le)' then 'attestation générée par une tâche planifiée' end,
    case when coalesce(s.terms_status, case when s.config ->> 'library_key' in ('ebay-fr') then 'confirmed' end) is distinct from 'confirmed' then 'page des conditions non confirmée' end,
    case when s.config ->> 'library_key' = 'utopya' then 'source bloquée par les CGV du fournisseur (accès automatisé interdit)' end
  ], null) as motifs,
  left(s.access_conditions, 300) as attestation_enregistree
from public.supplier_sources s
join public.organizations o on o.id = s.organization_id
where s.config ? 'library_key'
  and s.status <> 'paused'
  and (
    s.access_reviewed_by is null or s.access_reviewed_at is null
    or s.access_conditions ~ '(robots\.txt vérifié par le serveur|Activation enregistrée le)'
    or coalesce(s.terms_status, case when s.config ->> 'library_key' in ('ebay-fr') then 'confirmed' end) is distinct from 'confirmed'
    or s.config ->> 'library_key' = 'utopya'
  )
order by o.name, s.name;
