# Conseiller e-commerce IA (texte + voix)

État au 11 octobre 2026 :
- implémenté et testé avec des simulations (API Claude, base, voix) ;
- **déployé sur TEST** le 11 octobre : migration appliquée, Edge Function en version 22 (commit `bf3f645`), build TestFlight 9 lancé ;
- **reste à faire** : ajouter `ANTHROPIC_API_KEY` (secrets de l'Edge Function). Sans elle, l'écran affiche « conseiller non activé ».

## 1. Ce qui fonctionne réellement (dans le code)

- **Écran « Conseiller » (`/advisor`)** : on y accède depuis la carte « Parlez à votre conseiller » de l'onglet d'accueil (« Aujourd'hui »). L'ancien `/assistant` y redirige. L'écran propose :
  - l'historique des conversations (`/advisor/history`) et une nouvelle conversation ;
  - des bulles, des suggestions et la réponse affichée au fil de l'eau ;
  - un indicateur écoute / analyse (« Consultation : Bilan de l'activité ») / réponse ;
  - un bouton micro, un bouton d'arrêt de la lecture et de l'écoute, et « Écouter la réponse » ;
  - des cartes de résultats (ventes, marges, stock, commandes, colis, frais de port), des cartes d'action à confirmer et un brouillon de message avec « Copier » ;
  - des bandeaux hors ligne et « conseiller non activé sur le serveur ».
- **Voix**, toujours déclenchée par un appui explicite :
  1. dictée française de l'appareil (`expo-speech-recognition`, déjà présent), avec la permission demandée au premier appui ;
  2. le texte transcrit est envoyé avec `voice: true` (réponse courte, adaptée à l'oral) ;
  3. la réponse est lue par la voix française de l'appareil (`expo-speech`), phrase par phrase ; au-delà de 700 caractères, la lecture s'arrête et renvoie à l'écran.

  Interruption : le bouton ■ arrête la lecture, l'écoute et la requête. Un nouvel appui sur le micro coupe la lecture et réécoute. Le **mode conversation** (micro relancé après chaque réponse) n'est actif que si l'utilisateur l'allume, et il se coupe après une écoute sans parole ou après une erreur.
- **Données réelles**, sous les droits de l'utilisateur (RLS). Outils (`src/services/ai/advisor-tools.ts`) :

  | Catégorie | Outils |
  | --- | --- |
  | Lecture | `business_report` (CA, commandes, unités, coût d'achat connu, marge brute, frais de vente, bénéfice estimé, annulations / remboursements, données manquantes, comparaison à la période précédente), `product_profitability`, `stock_risks` (ruptures, risques, stock dormant et valeur immobilisée), `order_lookup`, `parcels_overview`, `shipping_quotes` (devis réels Packlink / Boxtal / Sendcloud si configurés et estimations des grilles, sans aucun achat), `today_briefing`, plus les 6 outils de l'ancien assistant (classement des ventes, synthèse, stock, commandes, compte eBay, annonces) |
  | Préparation (aucun effet) | `restock_plan` (proposition, aucune commande), `prepare_stock_adjustment`, `prepare_price_change` (prix MON STOCK, annonces eBay non modifiées), `draft_buyer_message` (brouillon, jamais envoyé) |
  | Exécution | **aucun outil du modèle**. Seule la route `POST /advisor/actions/confirm`, déclenchée par le bouton « Confirmer », exécute une action préparée |

- **Calculs définis** (`src/services/ai/advisor-metrics.ts`) :
  - montants en centimes entiers ;
  - périodes au calendrier de Paris (`this_week` = depuis lundi, `this_month` = depuis le 1er) ;
  - CA = lignes de commande hors port, annulations et remboursements exclus ;
  - marge brute = CA − coût d'achat, sur les seules lignes dont le coût est connu ;
  - bénéfice estimé = marge brute − frais de vente répartis au prorata ;
  - frais de port payés par le vendeur, retours et remboursements partiels : **non connus, donc signalés**.

  Rien n'est extrapolé : une donnée absente est comptée et listée.

## 2. Architecture retenue et pourquoi

```
iPhone : dictée de l'appareil ──texte──► Edge Function « api » (existante)
                                         POST /advisor/chat (flux NDJSON)
                                           ├─ RLS : session de l'utilisateur
                                           ├─ Claude (claude-opus-5-5) + outils fermés
                                           └─ conversations / messages / actions en base
iPhone : texte au fil de l'eau + cartes ◄──┘
iPhone : synthèse vocale de l'appareil (lecture de la réponse)
Bouton « Confirmer » ─► POST /advisor/actions/confirm (revérification, exécution, résultat)
```

| Option | Qualité du français | Latence | Coût | Expo / RN | Interruption | Sécurité / maintenance | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OpenAI Realtime (audio ↔ audio) | très bonne | la plus faible | audio facturé au jeton (`gpt-realtime-2.1` : 32 $ / 64 $ par million de jetons audio, soit environ 0,02 $/min d'écoute et 0,08 $/min de parole selon une conversion tierce) | WebRTC natif (module supplémentaire), jetons éphémères à émettre | native | second fournisseur, second modèle de raisonnement, outils à dupliquer | trop cher et trop complexe pour le gain |
| Transcription → modèle → synthèse (outils audio OpenAI) | bonne | moyenne | transcription environ 0,003 $/min, synthèse environ 0,015 $/min (tiers) + modèle | simple (fichiers audio) | à gérer | 3 appels payants par question, second fournisseur | possible, mais payant pour rien |
| **Claude (déjà intégré) + dictée et voix DE L'APPAREIL** | bonne (voix « Améliorée » si installée) | moyenne (le texte arrive au fil de l'eau) | **0 € pour la voix** ; seul le modèle est payé | modules Expo officiels | bouton ■, nouvel appui sur le micro | aucun nouveau fournisseur ni nouvelle clé ; réutilise les outils, la RLS et les quotas | **retenu** |

Possibilité d'évoluer sans tout refaire : brancher plus tard une voix serveur plus naturelle (`speak()` est isolé dans `apps/mobile/src/lib/tts.ts`). Ce serait un service payant, à justifier seulement si la voix de l'appareil déçoit.

Pourquoi l'Edge Function existante et pas une fonction dédiée : même authentification, même RLS, mêmes quotas et mêmes secrets. Le flux NDJSON y fonctionne (`ReadableStream`), et `fetch` d'Expo SDK 57 lit les flux (`expo/fetch`).

## 3. Sécurité et confirmations

- **Clés** : `ANTHROPIC_API_KEY` reste uniquement côté serveur. Le bundle iOS a été analysé (`npm run scan:bundle`) : aucun secret.
- **Accès aux données** : le modèle n'a ni SQL libre ni secrets. Il ne dispose que d'outils à schéma fermé (`additionalProperties: false`, validation zod), exécutés avec le client Supabase **de l'utilisateur**.
- **Données personnelles** : conversations et actions sont personnelles. RLS `user_id = auth.uid()` et membre de l'organisation ; un collègue de la même organisation ne les voit pas (test d'intégration).
- **Confirmation d'une action** : chaque action préparée a un résumé exact (action, objet, montant). Elle expire après 10 minutes et l'utilisateur ne peut pas la modifier (aucune politique UPDATE). La confirmation passe par un appui sur un bouton. Au moment de l'exécution, le serveur revérifie :
  - le propriétaire, l'organisation et le rôle (le rôle viewer est refusé) ;
  - le statut, puis réserve l'action une seule fois (`pending` → `executing`) ;
  - l'objet (stock ou prix inchangé depuis la préparation), sinon rien n'est fait.

  Un « oui » écrit ou oral n'exécute rien. Une confirmation ne vaut que pour cette action.
- **Achats** : aucune étiquette ni aucun paiement. L'achat d'étiquettes, l'envoi de messages eBay, la modification d'annonces et les commandes fournisseurs sont des **extensions futures**, déclarées au modèle comme indisponibles.
- **Limites** :
  - par utilisateur : 40 questions par heure (quota existant `ai_usage_events`) ; par organisation : 400 par jour ;
  - message : 2 000 caractères ;
  - historique envoyé : 12 messages et 12 000 caractères ;
  - au plus 6 étapes d'outils, 2 500 jetons de réponse et 100 s par tour.
- **Journaux** : identifiants techniques seulement (organisation, action, outil), jamais le contenu des messages ni de clé.

## 4. Coûts estimés (à confirmer sur votre facture)

Les abonnements Claude et ChatGPT ne couvrent **pas** l'API : elle est facturée séparément à l'usage.

| Poste | Coût |
| --- | --- |
| Transcription (dictée de l'appareil) | 0 € |
| Synthèse vocale (voix de l'appareil) | 0 € |
| Hébergement | Edge Function Supabase existante (quotas de votre formule Supabase) |
| Modèle | Claude Opus 5.5 : 4 $ par million de jetons en entrée, 20 $ en sortie, lecture du cache 0,20 $ |

Hypothèses : 6 000 jetons d'invite et d'outils mis en cache, 2 à 4 appels au modèle par question, et des réponses de 300 à 600 jetons avec une réflexion modérée (`effort: medium`).

| Usage | Estimation (Opus 5.5) |
| --- | --- |
| Question simple (1 outil) | environ 0,05 à 0,08 $ |
| Bilan complet (3 à 4 outils) | environ 0,12 à 0,20 $ |
| Conversation courte (5 questions) | environ 0,3 à 0,5 $ |
| Conversation longue (20 questions) | environ 1,5 à 2,5 $ (historique plafonné) |
| Plafond théorique par utilisateur | 40 questions par heure |

Passer à Claude Sonnet 5.5 (2 $ / 10 $) diviserait ces montants par deux environ, au prix d'analyses parfois moins fines. C'est votre décision : le modèle se change à un seul endroit, `AI_MODEL`.

## 5. Fichiers

**Serveur**
- `src/services/ai/advisor.ts` : boucle de conversation, flux, historique.
- `src/services/ai/advisor-tools.ts` : outils.
- `src/services/ai/advisor-actions.ts` : préparation et confirmation.
- `src/services/ai/advisor-metrics.ts` : calculs et périodes.
- `server/edge/api.ts` : routes.
- `src/features/mobile-api/contract.ts` : DTO.

**Base**
- `supabase/migrations/20261011000200_advisor.sql` : additive.
- `supabase/ops/rollback/20261011000200_advisor_down.sql` : retour arrière manuel.

**Mobile**
- `apps/mobile/src/app/(app)/advisor/index.tsx` et `history.tsx`.
- `src/components/advisor.tsx`.
- `src/data/advisor.ts`.
- `src/lib/tts.ts` et `src/lib/speech.ts` (rappels de fin et d'erreur).
- `src/app/(app)/assistant.tsx` (redirection).
- `expo-speech ~57.0.3`.

**Tests**
- `tests/unit/ai-advisor.test.ts` (34) ;
- `tests/integration/advisor.test.ts` (3, PostgreSQL réel) ;
- `apps/mobile/tests/advisor-data.test.ts` (9) et `advisor-screen.test.tsx` (12).

## 6. Pour tester sur iPhone (étapes manuelles)

1. **Avec votre accord**, appliquer la migration `20261011000200_advisor` sur le projet TEST et redéployer l'Edge Function `api` (version épinglée sur le commit poussé).
2. Dans Supabase (TEST) → Edge Functions → Secrets, ajouter vous-même `ANTHROPIC_API_KEY`.
3. **Avec votre accord**, lancer un nouveau build TestFlight. Il est indispensable : `expo-speech` est un module natif.
4. Sur l'iPhone :
   - autoriser le micro et la reconnaissance vocale au premier appui ;
   - **désactiver le mode silencieux** (iOS ne lit pas la synthèse vocale en silencieux) ;
   - facultatif : installer une voix française « Améliorée » dans Réglages → Accessibilité → Contenu énoncé → Voix.
5. Ouvrir l'accueil → « Parlez à votre conseiller ». Essayer :
   - « Fais-moi un bilan de mon activité ce mois-ci » ;
   - « Quels produits risquent la rupture ? » ;
   - « Ajoute 1 unité au stock de <code SKU> », puis « Annuler » et « Confirmer ».
6. Sans eBay connecté et synchronisé, le conseiller dit qu'il n'a pas de ventes et ne prétend pas avoir consulté le compte.
