#!/usr/bin/env bash
# Régénère src/db/database.types.ts depuis une base (locale ou Supabase).
# Usage : DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mon_stock_test npm run db:types
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:=postgresql://postgres:postgres@localhost:5432/mon_stock_test}"
{
  echo "// GÉNÉRÉ AUTOMATIQUEMENT par \`npm run db:types\` (supabase gen types). Ne pas modifier à la main."
  npx --yes supabase@latest gen types typescript --db-url "${DATABASE_URL}" --schema public
} > src/db/database.types.ts
echo "✓ src/db/database.types.ts régénéré"
