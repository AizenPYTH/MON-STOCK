# Plateformes externes de sourcing B2B — comparatif et classement

Étude du 15/10/2026. Fiches détaillées et preuves : [external-platforms-report.md](external-platforms-report.md). Intégration proposée : [external-platforms-integration.md](external-platforms-integration.md). Protocole de test : [external-platforms-test-plan.md](external-platforms-test-plan.md). Rapport de synthèse : [Plateformes externes sourcing B2B](../../reports/Plateformes%20externes%20sourcing%20B2B.md).

> Toutes les informations viennent d'**extraits de moteur de recherche** (lecture directe des pages bloquée par le proxy de la session). Aucun compte n'a été créé. Chaque case est à revérifier sur la page officielle, puis par écrit auprès du fournisseur.

## Légende

| Symbole | Sens |
|---|---|
| ✅ | Oui, CONFIRMÉ par la page officielle (vue en extrait) |
| ⚠️ | Partiel, sous condition, ANNONCÉ seulement, ou incohérent selon les pages |
| ❌ | Non, ou absence constatée dans toutes les recherches |
| ? | Inconnu : à confirmer auprès du fournisseur |

---

## 1. Tableau comparatif

| Candidat | Type | Catégories Snowolff | Multi-fournisseurs | Prix pro réels | Grades / capacités / EAN | Stock | API / flux | Accès petite structure | Coût connu | CGU réutilisation | Confiance |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Foxway** | Grossiste unique | ✅ iPhone recond., tablettes, portables, lots | ❌ | ✅ HT, Ex Works | ✅ grades par appareil ; ? capacité / EAN par ligne | ✅ temps réel | ⚠️ Excel ✅, API sur demande ⚠️ | ⚠️ compte + MOQ ≈ 2 000 € | ✅ pas d'abonnement trouvé | ? | Moyenne-haute |
| **Callisto** | Place de marché | ✅ téléphones, portables, tablettes recond. ; lots (W) | ✅ | ⚠️ prix fixe ou enchère | ⚠️ grades A–Dx (ANNONCÉ) ; ? capacité / IMEI | ? | ❌ | ✅ gratuit, KYC + n° TVA | ⚠️ inscription gratuite ; ? commission | ? | Moyenne |
| **DistriHUB** (distrihub.eu) | Agrégateur de catalogues | ⚠️ neuf seulement | ⚠️ « 400+ » (ANNONCÉ) | ⚠️ après validation | ⚠️ EAN ; grades sans objet | ⚠️ « live » | ⚠️ CSV/XML/JSON/EDI/API (ANNONCÉ) | ⚠️ compte vérifié, min. 300 € | ⚠️ 300 € ; ? 39 € sous 1 500 € | ? | Faible (identité à confirmer) |
| **ITscope** | Agrégateur de distributeurs | ⚠️ IT neuf | ✅ 300–400+ | ✅ par compte distributeur | ✅ EAN / MPN ; ❌ grades | ✅ | ✅ API XML/JSON | ❌ comptes distributeurs préalables | ✅ 51 € + 104 €/mois (annuel) | ? | Moyenne-haute (technique) |
| **Stock in the Channel** | Agrégateur de distributeurs | ⚠️ IT neuf | ✅ 35 en France (ANNONCÉ) | ✅ après approbation de chaque fournisseur | ⚠️ non documentés | ✅ quotidien | ⚠️ datafeed (doc 2018) | ⚠️ gratuit pour le stock ; prix sous comptes | ⚠️ £30 / £300 par mois (2018) | ? | Moyenne |
| **compuBase / EasyStock** | Outil de consultation | ⚠️ IT neuf | ⚠️ 16 distributeurs (page ancienne) | ? | ? | ⚠️ | ❌ | ? | ? | ? | Faible |
| **gsmExchange** | Bourse de négoce | ✅ téléphones, tablettes, lots | ✅ | ✅ prix demandés visibles | ❌ texte libre | ✅ « live » | ❌ | ❌ 2 références + volume | ? montants non publiés | ? | Moyenne |
| **Merkandi** | Annuaire de lots | ✅ iPhone A/B, lots, TVA sur marge | ✅ | ⚠️ négociés, sur demande | ⚠️ A/B/C par annonce | ❌ | ❌ (import vendeur seul) | ✅ abonnement | ⚠️ 190–870 €/an, incohérent | ? | Moyenne-faible |
| **Foneday** | Grossiste pièces | ✅ pièces Apple | ❌ | ✅ prix d'achat via API (en pratique) | ⚠️ codes modèle ; ? EAN / qualité | ✅ | ⚠️ API par clé, non documentée | ? | ⚠️ port FR 6,50 € (extrait) | ? | Moyenne |
| **MobileSentrix EU** | Grossiste pièces | ✅ pièces Apple | ❌ | ✅ HT après approbation | ⚠️ via ScanPro (ANNONCÉ) | ⚠️ | ⚠️ API réservée aux partenaires | ✅ documents + n° TVA | ? | ? | Moyenne |
| **2Service / Mobileparts.shop** | Grossiste pièces | ⚠️ pièces Samsung seulement | ❌ | ✅ compte B2B | ? | ? | ⚠️ liste de stock par e-mail | ⚠️ dealer login | ? | ? | Moyenne |
| **RepairPlugin** | Logiciel agrégateur | ⚠️ pièces | ✅ 10+ grossistes | ⚠️ pour son client, non redistribués | ⚠️ | ✅ toutes les 60 min | ❌ aucune API sortante | ✅ abonnement | ✅ 24–95 €/mois | ❌ redistribution non prévue (HYPOTHÈSE) | Moyenne-haute |
| **ThePhoneHub** | Grossiste unique | ⚠️ smartphones neufs | ❌ | ⚠️ prix unitaires dans le flux | ? colonnes | ⚠️ temps réel (ANNONCÉ) | ⚠️ CSV Live Link + API | ? via commercial | ? | ? | Faible-moyenne |
| **Ingram Micro** | Distributeur unique | ⚠️ IT neuf | ❌ | ✅ par compte | ⚠️ | ✅ par entrepôt | ✅ REST/JSON, OpenAPI, SDK | ❌ compte Ingram actif | ? | ? | Haute (technique) |
| **BigBuy** | Grossiste dropshipping | ❌ électronique générique | ❌ | ⚠️ prix dropship | ⚠️ attributs | ✅ | ✅ API documentée | ✅ abonnement | ⚠️ 69–99 €/mois (tiers) | ? | Moyenne-haute |
| **eBay Browse** (revente) | Place de marché | Revente seulement | ✅ | ❌ (prix de vente affichés) | ⚠️ condition eBay | ⚠️ | ✅ (déjà intégré) | ✅ | ✅ gratuit | ⚠️ cache limité, pas de mélange affiché (licence 2017) | Haute |
| **Keepa** (revente) | Données Amazon | Revente seulement | — | ❌ | ⚠️ neuf / occasion / Renewed | — | ✅ | ✅ | ⚠️ ≈ 49 €/mois (tiers) | ? | Moyenne |

Lecture en colonnes :
- **Multi-fournisseurs + flux officiel** : DistriHUB, ITscope, Stock in the Channel → **neuf seulement**.
- **Multi-fournisseurs + grades** : Callisto, gsmExchange, Merkandi → **aucun flux**.
- **Grades + flux** : grossistes uniques (Foxway ; ThePhoneHub côté neuf).
- Aucune ligne ne réunit les trois pour le reconditionné Apple.

---

## 2. Classement pondéré

### 2.1 Critères et poids

| # | Critère | Poids | Ce qui est noté |
|---|---|---|---|
| C | Couverture des catégories cœur | **25** | 4 = reconditionné Apple gradé + une autre catégorie cœur ; 3 = une catégorie cœur (reconditionné Apple **ou** pièces Apple) ; 2 = catégorie cœur partielle ; 1 = neuf IT / électronique ; 0 = hors catégories |
| D | Données comparables | **20** | Grades structurés, capacité, EAN/MPN, HT explicite : 4 = tout ; 3 = l'essentiel ; 2 = partiel ; 1 = texte libre ; 0 = rien de connu |
| A | Accès officiel aux données | **20** | 4 = API documentée publiquement ; 3 = flux / export officiel confirmé, ou API confirmée non documentée ; 2 = flux annoncé seulement ou API par clé sans doc ; 1 = export manuel ou API réservée à des partenaires ; 0 = aucun |
| P | Accessibilité pour une petite structure | **15** | 4 = ouverte sans condition ; 3 = compte vérifié, coût ou minimum modéré ; 2 = minimum élevé ou abonnement ; 1 = comptes tiers préalables ; 0 = barrière quasi infranchissable ou inconnue |
| M | Multi-fournisseurs | **10** | 4 = confirmé ; 3 = annoncé ; 2 = petit nombre ou page ancienne ; 0 = vendeur unique |
| K | Coût d'accès connu | **5** | 4 = public et nul ; 3 = public et faible ; 2 = public mais élevé, partiel ou incohérent ; 1 = fragmentaire ; 0 = inconnu |
| F | Confiance des preuves | **5** | 4 = haute ; 3 = moyenne-haute ; 2 = moyenne ; 1 = faible |
| | **Total** | **100** | Score = Σ (poids × note / 4) |

Pourquoi ces poids : le blocage constaté en production n'est pas le nombre de fournisseurs mais le nombre d'**équivalents stricts** (258 offres sur 270 en « données insuffisantes » pour « iPhone 13 », [analyse-bonnes-affaires.md](analyse-bonnes-affaires.md)). La couverture du cœur et la qualité des données pèsent donc 45 points ; le nombre de vendeurs, 10.

### 2.2 Règles de notation

1. **Seules les informations CONFIRMÉ ou ANNONCÉ sont notées.** Une HYPOTHÈSE ne donne aucun point.
2. Une information seulement **ANNONCÉ** plafonne la note à 3.
3. Une information **inconnue** vaut 0 et est marquée « ? » ; le score est donc un **plancher**.
4. **Prérequis bloquant** : un candidat dont l'accès dépend d'un prérequis que Snowolff n'a pas aujourd'hui (comptes chez des distributeurs, références commerciales) est classé **après** les candidats sans prérequis, quel que soit son score.
5. RepairPlugin est **hors classement** : il ne vend rien et ne redistribue pas ses données (interlocuteur, pas source). BigBuy est hors classement : déjà intégré et hors catégories cœur.

### 2.3 Notes et scores

| Candidat | C (25) | D (20) | A (20) | P (15) | M (10) | K (5) | F (5) | **Score** | Inconnues | Prérequis bloquant |
|---|---|---|---|---|---|---|---|---|---|---|
| Foxway | 4 | 3 | 3 | 2 | 0 | 3 | 3 | **70,0** | 0 | non |
| Callisto | 4 | 2 | 0 | 3 | 3 | 2 | 2 | **58,8** | 0 | non |
| ITscope | 1 | 3 | 3 | 1 | 4 | 2 | 3 | **56,3** | 0 | **oui** (comptes distributeurs) |
| DistriHUB | 1 | 2 | 2 | 3 | 3 | 2 | 1 | **48,8** | 0 | non (identité à confirmer) |
| Merkandi | 3 | 1 | 0 | 3 | 3 | 3 | 1 | **47,5** | 0 | non |
| MobileSentrix EU | 3 | 2 | 1 | 3 | 0 | 0 | 2 | **47,5** | K | non |
| Ingram Micro | 1 | 2 | 4 | 1 | 0 | 0 | 4 | **45,0** | K | **oui** (compte Ingram) |
| Foneday | 3 | 2 | 2 | 0 | 0 | 1 | 2 | **42,5** | P | non |
| Stock in the Channel | 1 | 1 | 3 | 1 | 3 | 1 | 2 | **41,3** | 0 | **oui** (approbation par distributeur) |
| gsmExchange | 3 | 1 | 0 | 0 | 3 | 0 | 2 | **33,8** | K | **oui** (2 références + volume) |
| ThePhoneHub | 1 | 2 | 2 | 0 | 0 | 0 | 1 | **27,5** | P, K | non |
| compuBase / EasyStock | 1 | 0 | 0 | 0 | 2 | 0 | 1 | **12,5** | D, P, K | non |

Détail des notes clés (preuves dans [external-platforms-report.md](external-platforms-report.md)) :
- Foxway D = 3 : grades individuels et HT CONFIRMÉS, capacité / EAN par ligne inconnus. A = 3 : export Excel et offre d'API CONFIRMÉS, sans doc. P = 2 : minimum ≈ 2 000 €.
- Callisto A = 0 : aucune API, aucun export trouvé. D = 2 : grille de grades ANNONCÉE, champs par lot inconnus.
- DistriHUB : tout est ANNONCÉ (plafond 3) ; F = 1 tant que l'identité n'est pas confirmée.
- Foneday P = 0 : conditions d'accès introuvables. Si elles s'avèrent comparables à MobileSentrix EU (note 3), son score passerait à 53,8. Pour les pièces, la clé API Foneday reste la piste d'accès aux données la plus directe ; MobileSentrix EU réserve son API à RepairDesk et MyRepairApp.

### 2.4 Classement final

| Rang | Candidat | Score | Rôle proposé |
|---|---|---|---|
| 1 | **Foxway** | 70,0 | Source à tester en premier (reconditionné cœur) |
| 2 | **Callisto** | 58,8 | Alternative multi-vendeurs ; demander un export |
| 3 | **DistriHUB** | 48,8 | Alternative neuf multi-fournisseurs par flux ; identité à confirmer |
| 4 ex aequo | Merkandi | 47,5 | Lots et TVA sur marge, consultation manuelle |
| 4 ex aequo | MobileSentrix EU | 47,5 | Pièces ; déjà lu en public (14 offres) |
| 6 | Foneday | 42,5 | Pièces ; demander une clé API |
| 7 | ThePhoneHub | 27,5 | Neuf ; flux CSV branchable sans code |
| 8 | compuBase / EasyStock | 12,5 | À écarter sauf information nouvelle |
| Après prérequis | ITscope | 56,3 | Seulement après des comptes distributeurs approuvés |
| Après prérequis | Ingram Micro | 45,0 | Adaptateur existant ; compte requis |
| Après prérequis | Stock in the Channel | 41,3 | Essai gratuit pour sonder les distributeurs |
| Après prérequis | gsmExchange | 33,8 | Plus tard, avec Foxway comme référence |
| Hors classement | RepairPlugin | — | Interlocuteur pour comprendre les flux pièces |
| Hors classement | BigBuy | — | Adaptateur existant, hors cœur |

### 2.5 Sensibilité

- **Multi-fournisseurs doublé** (M = 20, pris sur C = 15) : Foxway 60,0 ; Callisto 56,3 ; DistriHUB 53,8. L'ordre des trois premiers ne change pas.
- **Sans la règle du prérequis bloquant**, ITscope (56,3) passerait 3ᵉ, devant DistriHUB. La règle est retenue parce que Snowolff n'a aucun compte distributeur aujourd'hui ([RAPPORT-SOURCING](RAPPORT-SOURCING.md) §6).
- Les scores mesurent l'information **publique vérifiable**, pas la qualité des prix. Aucun prix réel comparable n'a été observé : le classement ne dit **rien** sur qui est le moins cher. Seul le [protocole de test](external-platforms-test-plan.md) peut le dire.

---

## Exclus et pourquoi

| Candidat | Type | Motif d'exclusion | Nature du motif | Preuve |
|---|---|---|---|---|
| B-Stock (dont liquidations Amazon UE) | Enchères de retours | CGU : robots, scrapers, data mining interdits ; pas d'API acheteur | Juridique — CONFIRMÉ | [B-Stock ToS](https://bstock.com/terms-of-use/) |
| Liquidity Services / Liquidation.com | Enchères de liquidation | CGU : spiders, crawlers, robots, data mining interdits ; API vendeur seulement | Juridique — CONFIRMÉ | [User Agreement](https://liquidityservices.com/user-agreement) |
| Utopya (FR) | Grossiste pièces | CGV art. 14 : extraction interdite, y compris après clôture du compte | Juridique — CONFIRMÉ | [CGV Utopya](https://www.utopya.fr/c-g-v) |
| gsmExchange (automatisation) | Bourse de négoce | Pas d'API ; usage automatisé non autorisé par écrit ; reste consultable à la main | Juridique / technique — HYPOTHÈSE | [Terms](https://www.gsmexchange.com/en/terms) |
| Jobalots, palettes FR (Easy Destocks…) | Lots de retours | Pas de flux ; manifestes absents ou sans état ; retours non testés | Données — CONFIRMÉ | [Jobalots](https://jobalots.com/en), [Easy Destocks](https://easydestock.com/a-propos) |
| Assurant / HYLA ASP | Enchères de reprises | Source unique, US, « as-is », grades modifiables | Périmètre — CONFIRMÉ | [ASP terms](https://www.assurant.com/asp-authorized-resellers) |
| Recommerce, Swappie B2B, Brightstar | Reconditionneurs | Pas de flux de stock ; volumes requis ; rachat plutôt que vente | Périmètre — CONFIRMÉ | [Recommerce](https://www.recommerce-solutions.com/produits-mobiles-reconditionnes/), [Swappie](https://business.swappie.com/services/) |
| Back Market, Refurbed (achat) | Places de marché grand public | API vendeurs : Snowolff y est vendeur, pas acheteur | Périmètre — CONFIRMÉ | [Back Market API](https://api.backmarket.dev/) |
| HUBX, RecirQ, BidAllies, Injured Gadgets, PLP… | Fournisseurs US | Douane, TVA import, pas de TVA sur marge UE | Économique — HYPOTHÈSE | [notes reconditionné](../../research_notes/Plateformes%20externes%20sourcing%20B2B/refurbished_phone_b2b.md) |
| AliExpress / Alibaba.com | Plateformes Chine | Pas de stock UE gradé ; extraction systématique interdite sans permission | Périmètre / juridique — ANNONCÉ | [Ecosire](https://docs.ecosire.com/odoo-modules/alibaba) |
| Syncee, Spocket, Wholesale2B, VidaXL, Brandsdistribution, Ankorstore | Dropshipping | Prix dropship ; ni reconditionné ni pièces ; catégories hors cible | Périmètre — CONFIRMÉ / HYPOTHÈSE | [notes flux](../../research_notes/Plateformes%20externes%20sourcing%20B2B/wholesale_liquidation_and_feed_aggregators.md) |
| Flxpoint, Inventory Source | Logiciels d'intégration | Redondants avec les adaptateurs MON STOCK ; 699 à 799 $/mois | Économique — CONFIRMÉ | [Flxpoint pricing](https://flxpoint.com/pricing) |
| RepairDesk, MyRepairApp, Repender, Fixably | Logiciels de réparation | Pas d'API sortante ; consommateurs de flux | Technique — ANNONCÉ | [Capterra RepairDesk](https://www.capterra.com/p/146659/RepairDesk/) |
| Apple IRP / GSX, Samsung GSPN | Canaux constructeur | Portails transactionnels ; pas de catalogue de prix exploitable ; IRP exige un technicien certifié | Technique — CONFIRMÉ / HYPOTHÈSE | [Apple Newsroom](https://www.apple.com/newsroom/2021/03/apples-independent-repair-provider-program-expands-globally/) |
| Icecat, 1WorldSync, Etilize (comme prix) | Données produit | Aucun prix d'achat ; Open Icecat reste utile pour l'EAN | Périmètre — CONFIRMÉ | [Icecat Stock & Pricing](https://icecat.com/stock-and-pricing/) |
| Prisync, Price2Spy, Netrivals, Keepa, eBay (comme prix d'achat) | Veille tarifaire | Prix de vente affichés seulement ; eBay Marketplace Insights fermé aux nouveaux | Périmètre — CONFIRMÉ | [eBay Developers](https://developer.ebay.com/api-docs/buy/static/ref-marketplace-supported.html) |
| Scrapers (Apify, Rainforest, idealo / Back Market) | Extraction tierce | CGU opposables (CJUE C-30/14), droit sui generis, fragilité | Juridique — CONFIRMÉ (jurisprudence) | [Pinsent Masons](https://www.pinsentmasons.com/out-law/news/cjeu-case-on-screen-scraping-has-potential-to-affect-business-models-says-expert) |
| Nexar / Octopart | Composants électroniques | Hors périmètre | Périmètre — CONFIRMÉ | [Nexar API](https://nexar.com/api) |
| DistriHub (Kenya) | ERP / caisse | Homonyme sans rapport | Identité — CONFIRMÉ | [Capterra](https://www.capterra.com/p/10043767/DistriHub/) |
