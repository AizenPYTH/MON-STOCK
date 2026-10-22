#!/usr/bin/env bash
# Recrée la base locale de test (PostgreSQL nu + shim Supabase + migrations).
# Usage : PGPASSWORD=postgres PGDATABASE=mon_stock_test npm run db:local:reset
#   (variables libpq : PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE ; DATABASE_URL n'est PAS lu ici,
#    il sert aux tests d'intégration : gardez les deux cohérents.)
#
# Garde-fou (D-03) : la base est SUPPRIMÉE puis recréée. Le script refuse donc tout hôte non local
# (une base Supabase, en particulier la production), PGHOSTADDR/PGSERVICE, et les bases système.
# Dérogation volontaire pour un serveur jetable distant : MONSTOCK_ALLOW_REMOTE_DB_RESET=<valeur exacte de PGHOST>.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=mon_stock_test}"
export PGHOST PGPORT PGUSER

refuse() {
  echo "✗ db-local-reset refusé : $1" >&2
  exit 3
}

is_local_host() {
  case "$1" in
    localhost | 127.0.0.1 | ::1 | /*) return 0 ;; # /… : répertoire de socket Unix
    *) return 1 ;;
  esac
}

if [ -n "${PGSERVICE:-}" ] || [ -n "${PGSERVICEFILE:-}" ]; then
  refuse "PGSERVICE/PGSERVICEFILE défini : la cible réelle ne peut pas être vérifiée."
fi
if [ -n "${PGHOSTADDR:-}" ] && ! is_local_host "${PGHOSTADDR}"; then
  refuse "PGHOSTADDR=${PGHOSTADDR} n'est pas une adresse locale."
fi
if ! is_local_host "${PGHOST}"; then
  case "${PGHOST}" in
    *ccywsegdowikeirbsfae* | *.supabase.co | *.supabase.com)
      refuse "PGHOST=${PGHOST} désigne un projet Supabase (production ou distant). Aucune dérogation possible pour Supabase." ;;
  esac
  if [ "${MONSTOCK_ALLOW_REMOTE_DB_RESET:-}" != "${PGHOST}" ]; then
    refuse "PGHOST=${PGHOST} n'est pas local. Dérogation (serveur jetable uniquement) : MONSTOCK_ALLOW_REMOTE_DB_RESET=${PGHOST}"
  fi
  echo "⚠ hôte distant ${PGHOST} autorisé par MONSTOCK_ALLOW_REMOTE_DB_RESET" >&2
fi
if ! [[ "${PGDATABASE}" =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; then
  refuse "PGDATABASE=${PGDATABASE} : nom invalide (attendu : minuscules, chiffres, _)."
fi
case "${PGDATABASE}" in
  postgres | template0 | template1) refuse "PGDATABASE=${PGDATABASE} est une base système." ;;
esac

psql -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists ${PGDATABASE};"
psql -v ON_ERROR_STOP=1 -d postgres -c "create database ${PGDATABASE};"
psql -v ON_ERROR_STOP=1 -d "${PGDATABASE}" -f supabase/local/0000_supabase_shim.sql
for f in supabase/migrations/*.sql; do
  echo "→ applying ${f}"
  psql -v ON_ERROR_STOP=1 -q -d "${PGDATABASE}" -f "${f}"
done
echo "✓ base ${PGDATABASE} prête"
