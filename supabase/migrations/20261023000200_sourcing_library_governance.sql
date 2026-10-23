-- =============================================================================
-- MON STOCK — migration 20261023000200 : gouvernance de la bibliothèque de sources
-- (audit 2026-10-22 : I-05, I-06, S-02).
--
-- 1. sourcing_library_checks.last_attempt_at : date de la dernière TENTATIVE de vérification.
--    Le passage planifié traite un lot borné des sources les moins récemment prises en charge ;
--    une source dont la vérification a été interrompue (fonction coupée) passe en fin de file au
--    lieu de bloquer les autres.
-- 2. supplier_sources : validation humaine tracée de l'accès automatisé (qui, quand, quelle page
--    des conditions). Une NOUVELLE source de la bibliothèque (config.library_key) ne peut être
--    créée qu'avec un validateur identifié ; sous une session utilisateur, le validateur est
--    obligatoirement l'utilisateur connecté (aucune attestation au nom d'un tiers).
--
-- Additif et non destructif : aucune source existante n'est modifiée, désactivée ni supprimée
-- (les sources déjà actives sont à revalider par le titulaire : supabase/ops/reports/).
-- Retour arrière manuel : supabase/ops/rollback/20261023000200_sourcing_library_governance_down.sql
-- =============================================================================

alter table public.sourcing_library_checks
  add column if not exists last_attempt_at timestamptz;

alter table public.supplier_sources
  add column if not exists access_reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists access_reviewed_at timestamptz,
  add column if not exists terms_url text,
  add column if not exists terms_status text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'supplier_sources_terms_url_check') then
    alter table public.supplier_sources
      add constraint supplier_sources_terms_url_check check (terms_url is null or (char_length(terms_url) <= 500 and terms_url ~ '^https://'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'supplier_sources_terms_status_check') then
    alter table public.supplier_sources
      -- confirmed : page des conditions confirmée par MON STOCK (preuve dans la bibliothèque) ;
      -- user_declared : page indiquée par l'utilisateur qui valide, non vérifiée par MON STOCK.
      add constraint supplier_sources_terms_status_check check (terms_status is null or terms_status in ('confirmed', 'user_declared'));
  end if;
end $$;

-- Validation humaine exigée pour toute NOUVELLE source de la bibliothèque à accès automatisé.
create or replace function public.supplier_sources_require_library_review()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.config ? 'library_key' and new.automated_access_confirmed then
    if new.access_reviewed_by is null or new.access_reviewed_at is null then
      raise exception 'Activation refusée : une source de la bibliothèque exige la validation tracée d''un utilisateur (auteur, date).'
        using errcode = 'check_violation';
    end if;
    if auth.uid() is not null and new.access_reviewed_by <> auth.uid() then
      raise exception 'Activation refusée : la validation doit être celle de l''utilisateur connecté.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger supplier_sources_require_library_review
  before insert on public.supplier_sources
  for each row execute function public.supplier_sources_require_library_review();

revoke all on function public.supplier_sources_require_library_review() from public, anon;
