# Rapport de remédiation — audit du 22/10/2026

État au 23/10/2026. Branche de travail : `claude/remediation-audit`. Le registre détaillé des 177 constats (un par ligne, avec le correctif et le test qui le prouve) est un document interne, conservé hors du dépôt public tant que tous les correctifs ne sont pas en production.

## 1. Bilan

| Statut | Nombre |
| --- | --- |
| Corrigé et testé (un test qui échouait avant passe maintenant) | 114 |
| Corrigé, vérification restante (préproduction, iPhone, production) | 31 |
| Bloqué par une action externe (juridique, réglage de compte, décision) | 29 |
| Déjà en ordre (points positifs de l'audit) | 3 |
| **Total** | **177** |

Les 4 constats critiques sont traités. Le blocage de la synchronisation eBay est corrigé et en production. La suppression de compte est en place côté serveur, web et iPhone, mais pas encore déployée. Les mentions légales sont bloquées, faute d'informations sur l'éditeur, qui ne seront pas inventées.

## 2. Ce qui est en production

| Date (UTC) | Composant | Contenu | Vérification |
| --- | --- | --- | --- |
| 23/10 07:05 | Edge `api` v65 (`43f55c9`) | Synchro eBay bornée (100 s), reprenable par curseur, runs abandonnés libérés | Runs `partial` (reprise) à 07:15 et 07:30, puis `success` à 07:45 sur les deux comptes eBay, alors que la synchro échouait depuis le 21/10 |
| 23/10 matin | Base `0100`→`0130` | Progression reprenable, un compte eBay = une connexion, idempotence vente/annulation en base, ventes antérieures à la connexion non déduites | Contrôles préalables à 0 ; schéma vérifié |
| 23/10 | Web `9c8b65b` | Next.js 16.4.2 et fflate 0.8.3 : failles critiques de Next ≤ 16.4.0 (exécution de code à distance, déni de service) | `npm audit` : 0 vulnérabilité ; build et 1 335 tests OK. Rendu en ligne non vu : le domaine est bloqué depuis cette session |
| 23/10 après-midi | Base `0200`→`0220` | Gouvernance des sources fournisseurs (CGV), imports reprenables, politesse par hôte | Colonnes, tables et fonctions présentes |

## 3. Ce qui est prêt mais pas encore en production

Tout le reste se trouve sur la branche :

- **Migrations restantes** : `0230`, `0300`→`0360`, `0500`→`0530`, `0600`, `0610`, `0700`, `0800`→`0820`.
  - Plusieurs recréent des politiques ou des contraintes (`drop … if exists`). Le garde-fou SQL exige alors une confirmation humaine, qui a expiré en l'absence du titulaire. Rien n'a été modifié.
  - La procédure exacte est dans `docs/OPERATIONS.md` §3.1.
- **Edge** : durcissement (Vault, `/health`, CORS, limites de débit, supervision des crons, journaux JSON, multi-clés), suppression de compte, IA (pseudonymisation, quotas atomiques), sourcing (traitements par lots).
- **Web** :
  - refonte visuelle complète (design system, thème sombre) ;
  - onboarding, pagination, organisation affichée ;
  - connexion eBay web (RuName dédié), accessibilité clavier ;
  - page « Mon compte » avec suppression.
- **iPhone** : suppression de compte, file d'attente hors ligne fiable, consentement IA, liens légaux, refonte visuelle. Il faut une build TestFlight, non lancée.

## 4. Tests exécutés (résultats exacts, branche `claude/remediation-audit`)

| Vérification | Résultat |
| --- | --- |
| `npx tsc --noEmit` | 0 erreur |
| `npm run lint` | 0 erreur, 0 avertissement |
| `npm test` (unitaires) | 173 fichiers, 1 741 tests réussis |
| `npm run test:integration` (`REQUIRE_DB=1`, base PostgreSQL 16 locale neuve, 59 migrations) | 32 fichiers, 231 tests réussis |
| `npm run build` | OK |
| e2e Playwright, pages publiques (`next start`) | 36 réussis |
| Mobile `npm --prefix apps/mobile run check` | 38 suites, 305 tests réussis ; scan du bundle : aucun secret |
| Bundle Edge (`node scripts/build-edge.mjs`) | reconstruit, 241 modules |
| Migrations | chacune appliquée, rejouée, défaite puis réappliquée sur base locale |

**Non exécuté :**

- e2e authentifié : il faut une préproduction Supabase ;
- tests sur iPhone réel (VoiceOver, taille du texte) ;
- CPU réel de l'Edge pour les gros imports ;
- CI GitHub après le dernier correctif du job mobile ;
- `pg_cron` et `net._http_response` réels pour la supervision.

## 5. Risques avant le prochain déploiement

1. **Ordre imposé** : les migrations 0500/0520/0530 doivent être immédiatement suivies de l'Edge, sinon le conseiller IA refuse les demandes. La 0510 et la 0230 viennent après l'Edge. La 0700 exige le secret Vault `PROJECT_URL`.
2. **Clé de chiffrement** : la nouvelle Edge refuse une clé non conforme. La clé du Vault est conforme (32 octets, vérifiée). Il reste à confirmer qu'aucune autre valeur n'est posée dans les secrets de l'Edge ni sur Vercel.
3. **Effet transitoire de la 0200, déjà appliquée** : activer une nouvelle source de la bibliothèque exige une validation des CGV que seule la nouvelle interface permet de saisir.
4. **Ancienne app iPhone** : elle reste compatible avec la nouvelle Edge (vérifié : elle envoie l'organisation sur toutes ses écritures et ne fait que lire les tables du conseiller).
5. **Refonte web** : vérifiée en mode aperçu sur toutes les pages, en clair et en sombre, à 1440 et 390 px, mais jamais contre la vraie base. Retour arrière possible par « Promote » du déploiement Vercel précédent.

## 6. Actions qui demandent le titulaire

- Confirmer les migrations restantes (fenêtres du garde-fou), puis le déploiement de l'Edge et du site.
- Mentions légales : fournir raison sociale, forme, adresse, SIREN, directeur de publication et e-mail (`npx tsx scripts/check-legal.ts`) ; faire relire CGU et confidentialité.
- Relire les CGV des 45 sources fournisseurs non vérifiées. Valider l'usage des logos.
- GitHub : protection de la branche de production (PR et CI obligatoires) ; autoriser Actions à ouvrir des PR. Vercel : plan Pro et région UE avant commercialisation.
- Supabase : PITR et test de restauration, `pg_dump` chiffré hors Supabase, copie hors ligne de la clé, protection des mots de passe divulgués, projet de préproduction.
- eBay : RuName web, budget d'appels réel, abonnement aux notifications « commandes ».
- iPhone : build TestFlight, fiche App Store Connect (URL de confidentialité, compte de démonstration, nom de l'app).
- Second administrateur sur chaque compte (GitHub, Supabase, Vercel, Expo, eBay, OpenAI).
