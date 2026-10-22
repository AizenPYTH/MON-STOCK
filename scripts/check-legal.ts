/**
 * Contrôle avant publication commerciale : liste les mentions légales manquantes.
 * Usage : npx tsx scripts/check-legal.ts  (code de sortie 1 s'il en manque).
 * Ne remplit rien : ces informations sont fournies par l'éditeur dans src/content/legal.ts.
 */
import { LEGAL_REQUIRED_FIELDS, missingLegalFields } from "../src/content/legal";

const missing = missingLegalFields();
if (missing.length === 0) {
  console.log("Mentions légales : complètes.");
} else {
  console.error(`Mentions légales incomplètes (${missing.length}) :`);
  for (const k of missing) console.error(`  - ${LEGAL_REQUIRED_FIELDS[k]} (LEGAL.${k})`);
  process.exitCode = 1;
}
