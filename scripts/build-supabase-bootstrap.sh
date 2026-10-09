#!/usr/bin/env bash
# Génère un script SQL unique pour initialiser un projet Supabase d'ENVIRONNEMENT DE TEST
# depuis l'éditeur SQL du dashboard (quand la CLI Supabase / l'accès direct à la base
# ne sont pas disponibles) : réinitialisation du schéma MON STOCK partiel éventuel,
# puis les migrations de supabase/migrations dans l'ordre, le tout dans UNE transaction
# (une erreur annule tout).
#
# ⚠️ La partie « réinitialisation » SUPPRIME les objets MON STOCK du schéma public.
#    À n'exécuter QUE sur un projet de test, jamais sur la production.
#
# Usage : bash scripts/build-supabase-bootstrap.sh > /chemin/bootstrap-test.sql
set -euo pipefail
cd "$(dirname "$0")/.."

cat <<'SQL'
-- =============================================================================
-- MON STOCK — initialisation d'un projet Supabase de TEST (généré, ne pas éditer)
-- Généré par scripts/build-supabase-bootstrap.sh à partir de supabase/migrations.
-- ⚠️ Réinitialise le schéma MON STOCK : NE JAMAIS EXÉCUTER SUR LA PRODUCTION.
-- =============================================================================
begin;

-- 1. Réinitialisation d'une installation partielle précédente (tables vides attendues).
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['organizations', 'organization_members', 'user_profiles', 'organization_invitations'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then
        raise exception 'ABANDON : public.% contient % ligne(s). Ce script ne s''exécute que sur un projet de test vide.', t, n;
      end if;
    end if;
  end loop;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists public.organization_invitations, public.organization_members, public.user_profiles, public.organizations cascade;
drop function if exists public.is_service_role, public.is_org_admin, public.create_organization_with_owner, public.handle_new_auth_user,
  public.can_write_org, public.create_sku, public.set_updated_at, public.org_role_of, public.accept_invitation, public.is_org_member,
  public.normalize_text cascade;
drop type if exists public.org_role cascade;

SQL

for f in supabase/migrations/*.sql; do
  printf '\n-- >>> %s\n' "$(basename "$f")"
  cat "$f"
  printf '\n'
done

cat <<'SQL'

-- Les clients PostgREST rechargent le schéma.
notify pgrst, 'reload schema';
commit;
SQL
