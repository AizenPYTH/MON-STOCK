# Conseiller e-commerce IA (texte + voix)

État au 11 octobre 2026 :
- implémenté et testé avec des simulations (API du modèle, base, voix) ;
- **déployé sur TEST** le 11 octobre : migration appliquée, Edge Function en version 22 (commit `bf3f645`), build TestFlight 9 lancé ;
- **11 octobre, après la mise en ligne** : le fournisseur IA passe de Claude (Anthropic) à **OpenAI** (seule clé disponible). Ce changement est dans le code (commit `b3718ad`) mais **pas encore déployé**.
- **reste à faire** : redéployer l'Edge Function (avec votre accord), puis ajouter vous-même `OPENAI_API_KEY` dans les secrets de l'Edge Function. Sans elle, l'écran affiche « conseiller non activé ».

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
  3. la réponse est lue par une **voix de synthèse OpenAI** (voix naturelle « marin » ou « cedar », au choix dans Réglages → Voix du conseiller), sinon par la voix française de l'appareil (`expo-speech`). Voir §2 bis.

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
                                           ├─ OpenAI (gpt-5.4-mini par défaut) + outils fermés
                                           └─ conversations / messages / actions en base
iPhone : texte au fil de l'eau + cartes ◄──┘
iPhone : synthèse vocale de l'appareil (lecture de la réponse)
Bouton « Confirmer » ─► POST /advisor/actions/confirm (revérification, exécution, résultat)
```

| Option | Qualité du français | Latence | Coût | Expo / RN | Interruption | Sécurité / maintenance | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OpenAI Realtime (audio ↔ audio) | très bonne | la plus faible | audio facturé au jeton (`gpt-realtime-2.1` : 32 $ / 64 $ par million de jetons audio, soit environ 0,02 $/min d'écoute et 0,08 $/min de parole selon une conversion tierce) | WebRTC natif (module supplémentaire), jetons éphémères à émettre | native | second fournisseur, second modèle de raisonnement, outils à dupliquer | trop cher et trop complexe pour le gain |
| Transcription → modèle → synthèse (outils audio OpenAI) | bonne | moyenne | transcription environ 0,003 $/min, synthèse environ 0,015 $/min (tiers) + modèle | simple (fichiers audio) | à gérer | 3 appels payants par question, second fournisseur | possible, mais payant pour rien |
| **Modèle texte (OpenAI) + dictée et voix DE L'APPAREIL** | bonne (voix « Améliorée » si installée) | moyenne (le texte arrive au fil de l'eau) | **0 € pour la voix** ; seul le modèle est payé | modules Expo officiels | bouton ■, nouvel appui sur le micro | une seule clé (OpenAI) ; réutilise les outils, la RLS et les quotas | **retenu** |

Possibilité d'évoluer sans tout refaire : brancher plus tard une voix serveur plus naturelle (`speak()` est isolé dans `apps/mobile/src/lib/tts.ts`). Ce serait un service payant, à justifier seulement si la voix de l'appareil déçoit.

Pourquoi l'Edge Function existante et pas une fonction dédiée : même authentification, même RLS, mêmes quotas et mêmes secrets. Le flux NDJSON y fonctionne (`ReadableStream`), et `fetch` d'Expo SDK 57 lit les flux (`expo/fetch`).

## 2 bis. Voix de lecture (synthèse OpenAI)

Il s'agit de **lire les réponses** avec une voix naturelle. Ce n'est **pas** la conversation vocale en temps réel de ChatGPT (Realtime API, audio dans les deux sens), qui reste une évolution possible.

- **Serveur** (`src/services/ai/speech.ts`) :
  - modèle `gpt-4o-mini-tts` (`OPENAI_TTS_MODEL` pour changer) ;
  - voix `marin` ou `cedar` (`OPENAI_TTS_VOICE` = voix par défaut ; le choix de l'utilisateur prime) ;
  - consignes de voix : français de France naturel, ton chaleureux et posé, intonation vivante mais sobre, pauses naturelles, débit légèrement modéré, ni GPS ni standard téléphonique, sans exagération.
- **Texte envoyé** (`src/domain/ai/speakable.ts`, partagé avec l'application) :
  - retirés : Markdown (titres, gras, code, liens), tableaux (cellules reformulées), listes, URL, émojis, noms techniques (`business_report` → « business report ») ;
  - unités dites à l'oral : euros, pour cent, jours, mille euros, numéro, « par rapport à » ;
  - limite de 900 caractères (≈ 1 minute), coupée à la fin d'une phrase.
- **Routes** (authentifiées) :
  - `GET /advisor/speech?messageId=&voice=` lit UNIQUEMENT une réponse du conseiller appartenant à l'utilisateur (relue sous sa session, RLS). Aucun texte arbitraire n'est synthétisé.
  - `GET /advisor/voice-sample?voice=` lit un texte de démonstration fixe et compte dans le quota IA.
  - Limite : 60 lectures par heure et par utilisateur, par instance du serveur (mémoire). Une limite en base demanderait d'ajouter un type d'événement à `ai_usage_events` (migration non faite).
  - Erreurs : chaque échec (clé, modèle, quota OpenAI, réseau) est **journalisé** côté serveur (statut, code, message tronqué, aucun secret).
- **Application** (`apps/mobile/src/lib/tts.ts`) :
  - l'audio est **téléchargé une seule fois** par réponse et par voix, puis gardé en cache (40 fichiers au plus) : une relecture ne coûte rien ;
  - un seul lecteur à la fois ; une nouvelle lecture ou ■ arrête l'audio en cours immédiatement ;
  - arrêt au passage en arrière-plan ;
  - lecture **même en mode silencieux** (`playsInSilentMode`) ;
  - en cas d'échec (serveur, réseau, délai de 15 s), la voix de l'appareil prend le relais.
- **Comparer marin et cedar** :
  - dans l'application : Réglages → Voix du conseiller → « Écouter » sur chaque voix (même texte), puis toucher la voix préférée ;
  - sur un ordinateur : `OPENAI_API_KEY=… node scripts/tts-compare.mjs` génère `marin.mp3` et `cedar.mp3`.

  **Aucune des deux voix n'a été écoutée par Claude** : l'API OpenAI n'est pas joignable depuis l'environnement de développement. « marin » est le choix par défaut sans écoute ; à vous de comparer.
- **Coût** : environ 0,015 $ par minute d'audio produite (prix tiers indicatif pour `gpt-4o-mini-tts`), soit environ 1 centime par réponse lue. Les relectures en cache sont gratuites.
- **Nouveaux modules natifs** : `expo-audio` et `expo-file-system`. Un nouveau build TestFlight est nécessaire ; les builds précédents gardent la voix de l'appareil.

## 3. Sécurité et confirmations

- **Clés** : `OPENAI_API_KEY` reste uniquement côté serveur. Les requêtes sont envoyées avec `store: false` (pas de stockage des échanges par OpenAI pour réutilisation dans le tableau de bord). Le bundle iOS a été analysé (`npm run scan:bundle`) : aucun secret.
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

L'abonnement ChatGPT (Plus, Pro…) ne couvre **pas** l'API OpenAI : elle est facturée séparément à l'usage.

| Poste | Coût |
| --- | --- |
| Transcription (dictée de l'appareil) | 0 € |
| Synthèse vocale | voix OpenAI : environ 1 centime par réponse lue, relecture gratuite (cache) ; voix de l'appareil : 0 € |
| Hébergement | Edge Function Supabase existante (quotas de votre formule Supabase) |
| Modèle | OpenAI `gpt-5.4-mini` (défaut) : 0,75 $ par million de jetons en entrée, 4,50 $ en sortie, entrée en cache 0,075 $. Ces prix viennent de sources tierces concordantes ; la page officielle d'OpenAI n'est pas accessible depuis cet environnement, donc à vérifier sur votre compte. |

Hypothèses : 6 000 jetons d'invite et d'outils mis en cache, 2 à 4 appels au modèle par question, et des réponses de 300 à 600 jetons avec une réflexion modérée (`effort: medium`).

| Usage | Estimation (gpt-5.4-mini) |
| --- | --- |
| Question simple (1 outil) | environ 0,01 à 0,02 $ |
| Bilan complet (3 à 4 outils) | environ 0,02 à 0,04 $ |
| Conversation courte (5 questions) | environ 0,06 à 0,10 $ |
| Conversation longue (20 questions) | environ 0,3 à 0,5 $ (historique plafonné) |
| Plafond théorique par utilisateur | 40 questions par heure |

Un modèle plus puissant (par exemple `gpt-5.5`, environ 5 $ / 30 $ par million de jetons selon des sources tierces) multiplierait ces montants par 6 à 7 environ. C'est votre décision : le modèle se change **sans redéploiement**, en ajoutant le secret `OPENAI_MODEL`. Le modèle choisi doit accepter les outils, les sorties structurées et le paramètre `reasoning_effort` (gamme gpt-5.x).

## 5. Fichiers

**Serveur**
- `src/services/ai/llm.ts` : accès au modèle (interface neutre + adaptateur OpenAI, flux, erreurs).
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
2. Dans Supabase (TEST) → Edge Functions → Secrets, ajouter vous-même `OPENAI_API_KEY` (et, si besoin, `OPENAI_MODEL`).
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
