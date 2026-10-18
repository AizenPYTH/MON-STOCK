#!/usr/bin/env bash
# APERÇU VISUEL : export web de l'application branché sur la base de démonstration (preview/),
# sans Supabase ni API réels (adresses « preview.invalid »). N'affecte aucune build.
# Usage : bash preview/export-web.sh <node_modules contenant react-native-web@0.21.2> <dossier de sortie>
# Puis : node preview/capture.mjs <dossier de sortie> <dossier des captures> "/today#full" …
set -euo pipefail
cd "$(dirname "$0")/.."
MODULES="${1:?dossier node_modules contenant react-native-web}"
OUT="${2:?dossier de sortie}"
MONSTOCK_PREVIEW=1 MONSTOCK_PREVIEW_MODULES="$MODULES" \
  EXPO_PUBLIC_SUPABASE_URL=https://preview.invalid EXPO_PUBLIC_SUPABASE_ANON_KEY=preview \
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_preview EXPO_PUBLIC_API_URL=https://preview.invalid \
  node node_modules/expo/bin/cli export --clear --platform web --output-dir "$OUT"
