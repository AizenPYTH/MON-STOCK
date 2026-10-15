# Plateformes externes de sourcing B2B — protocole de test et critères de décision

Étude du 15/10/2026. Le test sert à trancher **avec des données réelles** ce que la recherche publique ne peut pas dire : couverture en équivalent strict, coût rendu, fraîcheur. Voir aussi : [étude détaillée](external-platforms-report.md), [comparatif](external-platforms-comparison.md), [intégration proposée](external-platforms-integration.md), [rapport de synthèse](../../reports/Plateformes%20externes%20sourcing%20B2B.md).

> **Tous les seuils de ce document sont des PROPOSITIONS de l'auteur**, à ajuster par l'utilisateur. Ce ne sont pas des normes du marché. Aucune commande, aucun abonnement et aucune intégration ne se font sans décision explicite de l'utilisateur.

---

## 1. Questions auxquelles le test répond

| # | Question | Mesure |
|---|---|---|
| Q1 | Le candidat couvre-t-il nos références en **équivalent strict** ? | Taux de couverture stricte |
| Q2 | Son **coût rendu** bat-il notre meilleure offre actuelle ? | Écart de coût rendu ligne par ligne |
| Q3 | Ses données sont-elles **exploitables** par MON STOCK ? | Taux de remplissage, rapprochement EAN, quarantaine |
| Q4 | Ses données restent-elles **fraîches** ? | Changements J0 / J+1 / J+7 |
| Q5 | L'accès est-il **rentable** ? | Coût d'accès annuel ÷ gain de marge potentiel |

Candidats à tester, dans l'ordre ([comparatif](external-platforms-comparison.md#24-classement-final)) : **Foxway**, **Callisto**, **DistriHUB**, puis **Foneday** pour les pièces. ThePhoneHub et 2Service en option.

---

## 2. Panel de références (≈ 45 lignes, figé avant le test)

Le panel est figé **avant** d'obtenir les données, pour éviter de choisir les références qui flattent un candidat. Les modèles cités sont des **exemples à ajuster** au chiffre d'affaires réel de Snowolff ; ils reprennent les recherches déjà testées en production (iPhone 13, écran iPhone 12, batterie iPhone 11, [analyse-bonnes-affaires.md](analyse-bonnes-affaires.md)).

| Catégorie | Lignes | Composition proposée | Ce qui doit être identique pour compter |
|---|---|---|---|
| iPhone reconditionnés | 12 | 3 modèles (ex. iPhone 12, 13, 14) × 2 capacités (ex. 128 et 256 Go) × grades A et B | Modèle, capacité, état, **grade unique** (jamais « A/B ») |
| iPhone neufs scellés | 5 | Modèles récents, capacité précise, avec EAN | Modèle, capacité, couleur si le prix en dépend, EAN |
| Pièces Apple | 10 | Écran iPhone 12 en **soft OLED**, **hard OLED** et **Incell** ; batterie iPhone 11 ; vitre arrière ; nappe de charge ; etc. | Modèle, type de pièce, **qualité de pièce** (OLED ≠ Incell), état |
| MacBook reconditionnés | 5 | Air et Pro, configuration précise (puce, RAM, SSD, année) | Configuration complète, état, grade |
| iPad | 5 | Génération, capacité, Wi-Fi / cellulaire, grade | Idem |
| IT / électronique neuve | 5 | Références avec EAN | EAN |
| Lots / palettes | 3 | Lots de téléphones gradés ou mixtes | Comparés **entre lots seulement**, jamais à un prix unitaire |

Pour chaque ligne du panel, noter **avant le test** : la meilleure offre équivalente déjà présente dans MON STOCK (prix, fournisseur, HT/TTC, date) et la médiane eBay des annonces équivalentes (prix **affichés**, pas vendus : l'API eBay des prix vendus est fermée aux nouveaux utilisateurs, [eBay Developers](https://developer.ebay.com/api-docs/buy/static/ref-marketplace-supported.html)).

---

## 3. Étapes

| # | Étape | Détail | Qui décide |
|---|---|---|---|
| 1 | **Obtenir un accès d'essai ou un échantillon** | Compte revendeur Foxway, compte Callisto, échantillon de flux DistriHUB filtré « smartphones / Apple » (< 5 000 lignes, jeton en en-tête), clé API Foneday. Envoyer les questions du §6 en même temps | Utilisateur (Kbis, n° de TVA) |
| 2 | **Récupérer de vrais produits et prix** | Export Excel, échantillon de flux, réponse API ou captures du compte. Conserver le fichier brut daté (J0) | — |
| 3 | **Vérifier stock, devise, dates** | Quantité exacte ou statut ; devise explicite ; HT/TTC ; régime de TVA (normal, marge, autoliquidation) ; date de mise à jour déclarée par la source | — |
| 4 | **Rapprocher avec les références MON STOCK** | Pour chaque ligne du panel : trouvé en équivalent strict / trouvé mais non équivalent (préciser pourquoi) / absent | — |
| 5 | **Mesurer le taux de couverture stricte** | Par catégorie du panel | — |
| 6 | **Mesurer la qualité des données** | Taux de remplissage des champs (§4.2) ; lignes en texte libre ; grades mixtes ; lignes « lot » | — |
| 7 | **Compter les produits exploitables** | Nombre total de lignes du catalogue qui passeraient l'équivalence stricte (pas seulement le panel) : produit identifié (marque + modèle + capacité), prix, devise, HT/TTC connu | — |
| 8 | **Calculer le coût rendu et le potentiel de marge** | Ligne par ligne (§4.3), contre la meilleure offre actuelle et la médiane eBay | — |
| 9 | **Calculer les coûts d'accès** | Abonnement, commission, minimum de commande, port, frais bancaires, besoin de trésorerie (§4.5) | — |
| 10 | **Mesurer la fraîcheur** | Relevés **J0, J+1, J+7** : prix modifiés, stocks modifiés, lignes apparues / disparues, cohérence avec l'horodatage déclaré | — |
| 11 | **Import d'essai dans une organisation de test** | **Jamais dans l'organisation Snowolff.** Export Excel → import de fichier (mode `partial`) ; CSV → flux distant (mode `partial`, puis `snapshot` seulement si J0 / J+1 / J+7 sont complets et stables). Vérifier : quarantaine, rapprochement automatique par EAN, répartition des niveaux « bonne affaire », offres classées « lot » | Utilisateur (création de l'organisation de test) |
| 12 | **Commande d'essai (facultative)** | **Uniquement sur décision explicite de l'utilisateur**, au minimum autorisé. Contrôler grade reçu vs annoncé, délai, facture, régime de TVA, état des appareils (IMEI, batterie, verrouillage iCloud) | **Utilisateur seul** |

---

## 4. Mesures

### 4.1 Couverture stricte

`couverture stricte (catégorie) = lignes du panel trouvées en équivalent strict ÷ lignes du panel de la catégorie`

Les règles d'équivalence sont celles du moteur ([analyse-bonnes-affaires.md](analyse-bonnes-affaires.md)) : marque et modèle, type de produit, qualité de pièce, capacité, état et grade identiques ; jamais de lot ; jamais de produit hors service ; jamais d'annonce multi-modèles.

### 4.2 Qualité des données

| Champ | Mesure | Pourquoi |
|---|---|---|
| EAN / MPN | % de lignes renseignées et valides | Rapprochement automatique ([matching-service.ts](../../src/services/sourcing/matching-service.ts)) |
| Grade | % de lignes à grade **unique** structuré | Les grades mixtes bloquent l'analyse |
| Capacité | % de lignes avec capacité explicite | Équivalence stricte |
| Qualité de pièce | % des pièces avec type (soft / hard OLED, Incell, origine…) | Équivalence stricte |
| Quantité exacte | % de lignes avec quantité (pas seulement « en stock ») | Fiabilité du score |
| HT / TTC | % de lignes au régime explicite | Condition du niveau « Très intéressant » |
| Régime de TVA | % de lignes avec `vat_regime` connu | Marge réelle |
| Identifiant d'offre stable | Identique entre J0 et J+7 | Historique et expiration |

### 4.3 Coût rendu et potentiel de marge

`coût rendu unitaire = prix + TVA non récupérable + (port ÷ MOQ) + frais de plateforme + frais bancaires + douane hors UE`

- Comparer au **coût rendu de la meilleure offre équivalente actuelle** dans MON STOCK et à la **médiane eBay** (prix affichés).
- Marge estimée selon le modèle existant : revente − coût total − TVA sur marge − commission − paiement − expédition − emballage − provision retours ([analyse-bonnes-affaires.md](analyse-bonnes-affaires.md)). Tant que les paramètres de coûts ne sont pas renseignés dans Radar → Paramètres, toute marge reste « provisoire ».

### 4.4 Fraîcheur

| Mesure | J0 → J+1 | J0 → J+7 |
|---|---|---|
| % de prix modifiés | | |
| % de stocks modifiés | | |
| Lignes apparues / disparues | | |
| Écart entre date déclarée et date de relevé | | |

À comparer aux fréquences annoncées (ITscope : direct ou plusieurs fois par heure ; Stock in the Channel : quotidienne ou horaire ; RepairPlugin : 60 min ; Foxway : temps réel ; DistriHUB : « live »). Rappel : le radar marque une offre « ancienne » après 7 jours ([radar.ts](../../src/domain/sourcing/radar.ts)).

### 4.5 Rentabilité de l'accès

`seuil = coût d'accès annuel ÷ 12` = gain de marge mensuel minimal que la source doit apporter.

Exemple (simple calcul, sans donnée de marché) : ITscope Essential + API ≈ 1 860 €/an → au moins 155 € de marge supplémentaire par mois. Foxway, Callisto et DistriHUB n'ont pas d'abonnement trouvé : le seuil porte sur le minimum de commande et la trésorerie immobilisée.

---

## 5. Critères de décision (PROPOSITIONS)

### 5.1 Seuils go / no-go

| Critère | Seuil proposé | Éliminatoire ? |
|---|---|---|
| Couverture stricte sur la catégorie visée | **> 40 %** du panel de la catégorie | Oui |
| Coût rendu inférieur à la meilleure offre actuelle | Sur **au moins 1/3** des lignes couvertes | Oui |
| Régime HT/TTC | **Explicite** sur toutes les lignes (ou défaut de source documenté par écrit) | Oui |
| Droits sur les données | Stockage et affichage dans MON STOCK **autorisés par écrit** (ou CGU explicites) | Oui pour toute synchronisation automatique |
| Commande d'essai (si faite) | Grade reçu conforme ; facture et TVA conformes | Oui |
| Grade unique structuré (reconditionné) | ≥ 80 % des lignes | Non (dégrade le score) |
| EAN ou MPN | ≥ 50 % des lignes neuves et pièces | Non |
| Identifiants d'offre stables J0 → J+7 | ≥ 95 % | Non, mais impose le mode `partial` |
| Quarantaine à l'import d'essai | Aucune quarantaine sur un export complet | Non (à expliquer) |
| Rentabilité | Gain de marge mensuel estimé ≥ seuil du §4.5 | Oui pour une source payante |

### 5.2 Décision

| Résultat | Décision |
|---|---|
| Tous les critères éliminatoires passés | **Intégrer** selon la voie prévue ([intégration](external-platforms-integration.md)) |
| Couverture ou coût juste sous le seuil, données bonnes | **Tester davantage** (élargir le panel, refaire J+7) |
| Un critère éliminatoire échoue | **Abandonner** cette source |

---

## 6. Questions à poser à chaque fournisseur

### 6.1 Questions communes

1. **Documentation** de l'API ou du flux : URL de base, authentification (en-tête, pas dans l'URL), pagination, limites de débit, environnement de test.
2. **Colonnes / champs** : identifiant d'offre stable, SKU, EAN, MPN, modèle, capacité, couleur, état, grade, qualité de pièce, quantité exacte, prix, devise, HT/TTC, régime de TVA, MOQ, multiple de commande, pays d'expédition, délai, date de mise à jour.
3. **CGU** : stockage des données autorisé ? durée de conservation ? fréquence de synchronisation autorisée ? affichage dans un logiciel tiers (MON STOCK) ? Réponse **par écrit**.
4. **Prix** : grille unique ou prix par compte ? **prix par paliers** ?
5. **MOQ / minimum de commande** : par commande ou par ligne ?
6. **Livraison en France** : coût, délai, incoterm.
7. **TVA** : régime normal, **TVA sur marge**, autoliquidation ? Mention par ligne ?
8. **Conditions d'ouverture** : Kbis, n° de TVA intracommunautaire, ancienneté, volume.

### 6.2 Questions propres à chaque candidat

| Candidat | Questions spécifiques |
|---|---|
| **Foxway** | Export complet de la stocklist (CSV / XLSX / XML) ou API « personnalisée » : existe-t-elle, coût, documentation ? Identifiants stables d'un export à l'autre ? Le minimum d'environ 2 000 € s'applique-t-il par commande ou par ligne, et par catégorie ? Lignes « VAT Margin » disponibles pour la France ? Champs IMEI, santé batterie, capacité, EAN par ligne ? Composition réelle des feuilles « take-all » sans grade ([b2b-profiles.ts](../../src/services/sourcing/data/b2b-profiles.ts)) |
| **Callisto** | Export ou flux acheteur (catalogue à prix fixe) autorisé ? Commission acheteur ? Champs par lot (capacité, quantité, IMEI) ? Identifiant du vendeur dans l'export ? Devises, TVA sur marge ? Clauses d'automatisation |
| **DistriHUB** | Confirmer l'identité (Varle, distrihub.eu) ; schéma du flux acheteur ; filtre par catégorie et pays d'expédition ; distributeur ou entrepôt d'origine indiqué ? reconditionné disponible ? minimum 300 €, frais de 39 € sous 1 500 €, livraison en France ; jeton en en-tête |
| **Foneday** | Clé API : conditions d'obtention, endpoints, champs (EAN, qualité OLED / Incell), limites de débit, prix par paliers, CGU d'usage dans un logiciel tiers ; conditions d'ouverture (TVA, KvK/Kbis, minimum) ; port France exact |
| **ThePhoneHub** | Le lien CSV Live Link est-il public ou propre à chaque partenaire ? Colonnes, séparateur, encodage, fréquence ; documentation de l'API ; stock reconditionné ? |
| **MobileSentrix EU** | Partenariat API possible pour un logiciel tiers (hors RepairDesk / MyRepairApp) ? Port France |
| **2Service** | Format de la liste de stock grossiste ; fréquence d'envoi |
| **ITscope** | Liste des distributeurs actifs en France ; cumul Essential + API ; HT ; clauses de stockage et redistribution |
| **Stock in the Channel** | Tarifs 2026 en EUR ; licence du datafeed ; quels distributeurs approuvent une petite structure |
| **Merkandi** | Autorisation écrite d'une consultation automatisée (sinon consultation manuelle seulement) ; tarif acheteur réel sur merkandi.com |
| **gsmExchange** (plus tard) | Tarif d'adhésion ; références acceptées ; export ou API |

---

## 7. Ce qui reste impossible à vérifier sans compte

| Information | Candidats concernés |
|---|---|
| **Prix réels** et leur compétitivité face au sourcing actuel | Tous |
| Prix personnalisés par compte ou grille unique | Foxway, DistriHUB, Foneday, MobileSentrix EU |
| Prix par paliers | Foneday, MobileSentrix EU, 2Service |
| Champs réels du flux ou de l'export (EAN, grade, capacité, IMEI, batterie, qualité de pièce) | Foxway, DistriHUB, Foneday, ThePhoneHub, Callisto |
| Profondeur réelle du catalogue sur les références Snowolff | Tous |
| Existence et contenu de l'API | Foxway, Foneday, ThePhoneHub, DistriHUB |
| Fréquence réelle de mise à jour | Tous |
| Commission, frais de transaction, adhésion | Callisto, gsmExchange |
| Frais de port vers la France | Foxway, DistriHUB, MobileSentrix EU, 2Service, Callisto |
| Régime de TVA par ligne (marge, autoliquidation) | Foxway, Callisto, DistriHUB |
| Critères réels d'approbation du compte | Foxway, Callisto, DistriHUB, Foneday, distributeurs IT |
| Clauses de CGU sur le stockage et l'usage dans un logiciel tiers | Tous (aucune autorisation explicite trouvée) |
| Conformité des grades reçus | Tous (commande d'essai seulement) |
| Identité de « DistriHUB » | À confirmer par l'utilisateur |

---

## 8. Fiche de résultat (à remplir par candidat)

| Rubrique | Valeur |
|---|---|
| Candidat, date d'accès, type d'accès (export, flux, API, captures) | |
| Couverture stricte par catégorie (%) | |
| Lignes exploitables (total catalogue) | |
| Taux de remplissage : EAN / grade / capacité / quantité / HT-TTC / TVA | |
| Lignes où le coût rendu bat la meilleure offre actuelle (n / %) | |
| Écart médian de coût rendu (€ et %) | |
| Fraîcheur J0 → J+1 / J0 → J+7 | |
| Import d'essai : quarantaine, rapprochement EAN automatique, niveaux obtenus | |
| Coût d'accès annuel et seuil de rentabilité | |
| CGU : réponse écrite reçue (oui / non, référence) | |
| Commande d'essai (si décidée) : conformité | |
| **Décision proposée** : intégrer / tester davantage / abandonner | |
