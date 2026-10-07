#!/usr/bin/env bash
# Recrée la base locale de test (PostgreSQL nu + shim Supabase + migrations).
# Usage : DATABASE_URL=postgres://user:pass@localhost:5432/mon_stock_test npm run db:local:reset
set -euo pipefail
cd "$(dirname "$0")/.."

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=mon_stock_test}"
export PGHOST PGPORT PGUSER

psql -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists ${PGDATABASE};"
psql -v ON_ERROR_STOP=1 -d postgres -c "create database ${PGDATABASE};"
psql -v ON_ERROR_STOP=1 -d "${PGDATABASE}" -f supabase/local/0000_supabase_shim.sql
for f in supabase/migrations/*.sql; do
  echo "→ applying ${f}"
  psql -v ON_ERROR_STOP=1 -q -d "${PGDATABASE}" -f "${f}"
done
echo "✓ base ${PGDATABASE} prête"
