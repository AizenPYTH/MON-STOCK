#!/usr/bin/env node
/**
 * Comparaison à l'oreille des voix du conseiller (test manuel, poste de travail).
 *
 *   OPENAI_API_KEY=... node scripts/tts-compare.mjs [dossier]
 *
 * Génère `marin.mp3` et `cedar.mp3` avec le MÊME texte représentatif de MON STOCK et les MÊMES
 * consignes que le serveur (src/services/ai/speech.ts ; un test vérifie qu'ils sont identiques).
 * La clé n'est lue que dans l'environnement ; rien n'est écrit d'autre que les deux fichiers.
 * Coût : deux courtes synthèses (quelques centimes au plus).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export const SAMPLE_TEXT =
  "Bonjour ! Ce mois-ci, vous avez réalisé mille deux cent quatre-vingts euros de chiffre d'affaires, soit douze pour cent de plus que le mois dernier. Votre iPhone 13 reconditionné reste votre meilleure vente, mais il ne vous en reste que deux en stock : je vous conseille de recommander rapidement. Bonne nouvelle aussi : vos trois colis Colissimo de mardi ont bien été livrés.";
export const INSTRUCTIONS = [
  "Tu lis à voix haute la réponse d'un conseiller à un vendeur indépendant, sur son téléphone.",
  "Langue : français de France, naturel, comme dans une vraie conversation entre collègues.",
  "Ton : chaleureux et posé ; intonation vivante mais sobre ; pauses naturelles entre les idées ; débit légèrement modéré.",
  "À éviter : ton de GPS, de standard téléphonique, de publicité ou de lecture monotone ; aucune exagération théâtrale.",
  "Prononce les montants, quantités et pourcentages comme on les dit à l'oral.",
].join(" ");
export const VOICES = ["marin", "cedar"];
export const MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";

async function main() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("OPENAI_API_KEY absente de l'environnement.");
    process.exit(1);
  }
  const out = path.resolve(process.argv[2] ?? "tts-compare");
  mkdirSync(out, { recursive: true });
  for (const voice of VOICES) {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, voice, input: SAMPLE_TEXT, instructions: INSTRUCTIONS, response_format: "mp3" }),
    });
    if (!res.ok) {
      console.error(`${voice} : HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
      process.exit(1);
    }
    const file = path.join(out, `${voice}.mp3`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`✓ ${file}`);
  }
  console.log("Écoutez les deux fichiers, puis choisissez la voix dans l'application (Réglages → Voix du conseiller) ou avec le secret OPENAI_TTS_VOICE.");
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
