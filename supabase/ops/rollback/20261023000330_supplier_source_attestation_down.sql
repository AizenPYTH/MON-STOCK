-- Retour arrière MANUEL de 20261023000330_supplier_source_attestation.sql (D-09).
-- À n'exécuter qu'après décision explicite. PERTE D'INFORMATION : le journal des attestations et
-- les colonnes access_attested_by / access_attested_at sont supprimés. Exporter avant si besoin :
--   copy (select * from public.supplier_source_attestations) to stdout with csv header;
--   copy (select id, access_attested_by, access_attested_at from public.supplier_sources where access_attested_at is not null) to stdout with csv header;
-- Remettre AUSSI src/features/suppliers/discovered-actions.ts dans sa version antérieure (UPDATE
-- direct) si la RPC est supprimée, sinon la validation des sources découvertes échouera.

drop function if exists public.attest_supplier_source_access(uuid, text, boolean);

drop trigger if exists supplier_sources_attestation_log on public.supplier_sources;
drop trigger if exists supplier_sources_attestation_stamp on public.supplier_sources;
drop function if exists public.supplier_sources_attestation_log();
drop function if exists public.supplier_sources_attestation_stamp();

drop table if exists public.supplier_source_attestations;

-- Droit UPDATE de niveau table rétabli (état d'origine : toutes les colonnes).
revoke update on public.supplier_sources from authenticated;
grant update on public.supplier_sources to authenticated;

alter table public.supplier_sources
  drop column if exists access_attested_at,
  drop column if exists access_attested_by;
