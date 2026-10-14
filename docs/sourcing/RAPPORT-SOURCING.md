# MON STOCK — Rapport complet « Sourcing / Fournisseurs »

État au 14/10/2026 : production Supabase `ccywsegdowikeirbsfae`, organisation « Snowolff », Edge Function `api` v53, application iOS build 18 (TestFlight).

---

## 1. En une minute

| | |
| --- | --- |
| Fournisseurs branchés et actifs | **22** sources (19 de la vague A + 3 déjà actives) |
| Offres réelles en base | **1 763**, toutes actives, toutes avec prix > 0 et lien vers la fiche |
| Devises | EUR, GBP, PLN, CZK, converties en EUR (taux BCE) |
| Offres avec quantité exacte en stock | 378 |
| Offres au stock inconnu (laissé inconnu, jamais inventé) | 359 |
| Bibliothèque de sources vérifiées « ok » | 24 sur 31 |
| Recherche dans l'app | tous les résultats du moins cher au plus cher, appui = page du produit chez le fournisseur |
| Collecte hebdomadaire | code prêt et testé, **migration pas encore appliquée** (voir §7) |

---

## 2. Comment ça marche (simplement)

1. **Bibliothèque de sources** : liste de fournisseurs vérifiés dans le code.
   - Le serveur contrôle chaque jour (04:23 UTC) que robots.txt autorise l'accès et que de vrais produits avec prix sont lisibles.
   - Une source n'est activable qu'après ce contrôle réussi.
2. **Connecteurs** (« adaptateurs »), un par type de boutique :
   - **WooCommerce** : API publique de la boutique, 100 produits par page, quantité souvent fournie.
   - **Shopify** : fichier `products.json` public ; devise absente, donc on la fixe par source.
   - **Plan du site + données structurées** : on lit le sitemap publié pour les robots, puis le prix, la devise et le stock dans chaque fiche (JSON-LD ou balises produit).
   - **eBay** : API officielle Browse.
   - Fichiers et flux CSV / XML / JSON importés, et API à compte (Ingram, BigBuy) : écrits, pas encore utilisés faute de compte.
3. **Collecte** : le serveur lit les catalogues et enregistre les offres dans `sourcing_offers`.
   - L'enregistrement est sans doublon : une offre est unique par organisation, source et identifiant.
   - Historique des prix et du stock.
   - Conversion de devise.
   - Rapprochement automatique avec tes produits quand l'EAN ou la référence correspond.
4. **Recherche « Fournisseurs »** dans l'app :
   - Tu tapes « iPhone 13 » : le serveur interroge en direct les fournisseurs qui le permettent, puis cherche dans toutes les offres enregistrées.
   - Le filtre en base ignore les accents.
   - Les résultats sont triés par prix converti en EUR.

---

## 3. Les fournisseurs qui marchent (données réelles en base)

| Fournisseur | Pays | Type | Offres | Devise | Stock |
| --- | --- | --- | --- | --- | --- |
| Refreshed Apples | NL | iPhone d'occasion en gros | 351 | EUR | surtout inconnu |
| Subastalotes | ES | lots / palettes | 300 | EUR | quantité exacte |
| Ekolow | FR | pièces MacBook | 243 | EUR | statut + 28 quantités |
| Repuestosmovil | ES | pièces smartphone | 208 | EUR | en stock |
| PC Ricondizionati | IT | ordinateurs reconditionnés | 198 | EUR | en stock |
| Flashmac | IT | informatique | 127 | EUR | 45 quantités ⚠ contient des devis |
| Brico-phone | FR | pièces | 24 | EUR | statut |
| Mobinova | — | pièces iPhone | 22 | EUR | statut |
| Pulled Mac Parts | NL | pièces MacBook d'origine | 21 | EUR | statut |
| Servisní díly | CZ | pièces | 21 | CZK | statut |
| 2repair | UK | pièces | 16 | GBP | statut |
| Mobilepart.pl | PL | pièces | 16 | PLN | statut |
| Bitstockz | PL | palettes de retours | 16 | PLN | statut |
| MobileSentrix EU | NL | pièces Apple | 14 | EUR | statut |
| GSMOK | PL | pièces | 9 | EUR | statut |
| DA Pièces | FR | pièces | 8 | EUR | statut |
| Bestellaptops | NL | portables reconditionnés | 8 | EUR | statut |
| Portatilmovil | ES | pièces portables | 8 | EUR | statut + EAN |
| Eurolots | — | lots | 8 | EUR | statut |
| Hurtel | PL | accessoires (généraliste) | 6 | EUR | statut |
| Shop Technoworld | IT | pièces | 4 | EUR | statut |
| ComputerG | — | composants | 3 | EUR | statut |

Les petits chiffres correspondent à une **première passe partielle** (quelques pages par fournisseur). Le catalogue complet viendra avec la collecte hebdomadaire.

---

## 4. Les fournisseurs qui ne marchent pas, et pourquoi

| Raison | Fournisseurs |
| --- | --- |
| Prix réservés aux comptes pro (le stock est parfois visible, jamais le prix) | MPS Mobile, Mobistock, Dutch Mobile Parts, 4Phones, LCD-Phone, Mobilax (Kbis), Hurtowniagsm, TR-Vertrieb, A-Parts, Buymolano, B2B Mobile Wholesalers |
| Pas de prix lisible par machine sur les pages | iFixit EU (fiches), Phonegigant, Wholesale Clearance, Horepa, IPartsPro, Nowacell, Sifar, Dutchspares, Smartchoice |
| Pas de plan du site exploitable | Macway, Ecoportatil, GSM Parts Center, Foneday, Replace Base EU, Mobileparts.shop, PhoneMadrid, SOSav, AppleParts.pl, Smaaart, PC-Portatil, Tecnofix, TheBookYard, Smartpart4u, Mobileworld.at, Mobiltec24 |
| Refus du site (respecté, jamais contourné) | robots.txt : Certideal, Injured Gadgets, Pieces2Mobile, IT-Versand, ITP, Ingrosmart, Spainsellers. Anti-robot : Replace Base UK, Telehurt (HTTP 415) |
| Interdit par les conditions du fournisseur | Utopya (CGV art. 14), B-Stock |
| Prix trouvés mais non comptés | Retourendirekt (pages de présentation), Smartgrade (prix de rachat) |
| Accès commercial uniquement | Mobile Depot (listes par e-mail), Foxway, ThePhoneHub, DistriHUB : flux possibles après ouverture d'un compte |

---

## 5. ✅ Points forts

1. **Données 100 % réelles et vérifiées.**
   - Aucun prix inventé, aucun fournisseur compté sans collecte réussie.
   - Chaque offre garde sa provenance : URL, date, méthode.
2. **Rien de faux sur le stock.**
   - Un stock inconnu reste inconnu, et une panne ne crée jamais de rupture.
   - Une collecte partielle ne fait disparaître aucune offre.
   - Une offre ne peut expirer qu'après 2 collectes complètes sans elle (règle testée sur la base de production).
3. **Légal et respectueux.**
   - robots.txt vérifié à chaque passage.
   - Une seule requête à la fois par site, au moins 2 s entre deux requêtes.
   - Aucun CAPTCHA, aucune connexion, aucun anti-robot contourné, et les CGU sont respectées (Utopya, B-Stock exclus).
4. **Multi-pays et multi-devises.** FR, ES, IT, NL, PL, CZ, UK, avec conversion automatique en EUR (BCE).
5. **Robuste face aux sites difficiles.** Ces cas sont gérés :
   - plans du site compressés (.gz) ;
   - plans géants, lus en partie ;
   - fiches de plus de 4 Mo ;
   - Shopify bloqué en 429 (contourné proprement par le plan du site) ;
   - réessai unique après 429/503 ;
   - mémoire du serveur bornée.
6. **Sans doublon.** La contrainte d'unicité en base rend chaque collecte rejouable sans risque.
7. **Recherche simple.**
   - Un champ de recherche, tous les résultats du moins cher au plus cher, nom du fournisseur, stock, prix converti.
   - Un appui ouvre la page du produit chez le fournisseur.
8. **Sécurité.**
   - Données isolées par organisation (RLS vérifiée sous ton identité).
   - Fonctions sensibles réservées au serveur.
   - Aucune clé dans l'app mobile.
9. **Collecte hebdomadaire bien conçue (prête).** Calendrier par fournisseur, verrou anti-doublon d'exécution, reprise au bon endroit après coupure, et collecte « complète » seulement si zéro erreur.
10. **Builds iOS sans dépendre du quota Expo.** Build sur un Mac GitHub (gratuit, dépôt public), puis envoi automatique sur TestFlight.
11. **Bien testé.** 976 tests serveur, plus les tests mobiles ; migration vérifiée sur PostgreSQL local et sur la production (transaction annulée).

---

## 6. ⚠️ Points faibles

1. **Catalogues encore incomplets.** La plupart des fournisseurs n'ont que 3 à 22 offres (première passe). Tant que la collecte hebdomadaire n'est pas active, la recherche ne voit qu'une partie des produits.
2. **Collecte hebdomadaire non activée.** La migration attend une dernière vérification (retour arrière sur la production), bloquée par une confirmation manuelle de l'outil SQL (§7).
3. **Les meilleurs grossistes sont fermés.**
   - Foxway, Mobilax, MPS, Mobistock, TR-Vertrieb, 4Phones, LCD-Phone : prix visibles seulement avec un compte pro.
   - Ce sont souvent les prix les plus intéressants pour la revente : sans compte (Kbis, n° TVA), on n'y a pas accès.
4. **Stock souvent approximatif.**
   - Seules 378 offres (environ 21 %) ont une quantité exacte.
   - Ailleurs on a seulement « en stock » ou « rupture », et 359 offres restent inconnues (surtout Refreshed Apples).
5. **Peu de codes EAN** (Portatilmovil surtout). Le rapprochement automatique avec ton stock repose donc sur les titres, ce qui est moins fiable.
6. **HT / TTC inconnu** pour presque toutes les sources. Les prix affichés sont ceux du site, à vérifier avant de calculer une marge.
7. **Bruit dans certains catalogues.**
   - Flashmac contient des devis (« Preventivo », jusqu'à 13 559 €).
   - Hurtel et Eurolots sont généralistes (vélo, puériculture…).
   - Subastalotes vend surtout des lots non tech, avec 250 lots en rupture.
8. **Les gros catalogues seront lents à parcourir.**
   - Écriture des offres d'environ 0,25 s par offre, 15 min entre deux passages, 5 fournisseurs par passage.
   - Un fournisseur de 10 000 produits mettra plusieurs jours à être couvert complètement.
9. **Plans du site plafonnés.**
   - Au-delà de 40 000 URL, 6 sous-plans ou 25 Mo, la collecte est marquée « incomplète ».
   - Les offres disparues de ces gros sites (Hurtel, LCD-Phone, MPS…) ne seront jamais expirées automatiquement.
10. **Recherche en direct lente** : jusqu'à 35 s quand plusieurs fournisseurs sont interrogés en même temps.
11. **Dépendance aux sites.**
    - Un changement de structure (thème, plan du site) peut casser un connecteur sans prévenir.
    - Le contrôle quotidien le détecte, mais ne le répare pas.
12. **iFixit EU** : la devise n'est pas fournie par la boutique, donc la source n'est pas activée.
13. **Conditions d'utilisation** : les 19 activations sont faites à ta demande, mais tu n'as pas relu les conditions de chaque fournisseur. À faire.

---

## 7. Ce qui reste à faire (par priorité)

1. **Activer la collecte hebdomadaire.**
   - Relancer le test de retour arrière ; tu approuves la confirmation `DROP` (le test s'annule de lui-même).
   - Ensuite : appliquer la migration, programmer le cron toutes les 15 min, passer les 22 sources en hebdomadaire et lancer la collecte générale.
2. **Ouvrir des comptes pro** (Kbis, TVA) chez Mobilax, Foxway, MPS Mobile, Mobistock, TR-Vertrieb, 4Phones. Les flux CSV/API de ces comptes se branchent sur l'import existant.
3. **Nettoyer le bruit** : exclure les devis Flashmac et filtrer les catégories hors tech (Hurtel, Eurolots, Subastalotes).
4. **Préciser HT / TTC et frais de port** par fournisseur, pour des marges justes.
5. **Accélérer l'écriture des offres** : rapprochement automatique en différé, ce qui donnerait des catalogues complets en heures plutôt qu'en jours.
6. **Relire les CGU** des 19 fournisseurs activés.
7. **API gratuites à ouvrir** : Mouser, TME, Farnell (composants), avec un compte développeur gratuit.

---

## 8. Où trouver le détail

| Sujet | Fichier |
| --- | --- |
| Essais réels, fournisseur par fournisseur | `docs/sourcing/collection-report.md` |
| Migration hebdomadaire et vérifications | `docs/sourcing/weekly-collection-migration.md` |
| Annuaire des 265 fournisseurs étudiés | `docs/sourcing/supplier-directory.md` et `.csv` |
| Méthodes d'accès | `docs/sourcing/access-methods.md` |
| Plan d'implémentation | `docs/sourcing/implementation-plan.md` |
| Code de la collecte | `src/services/sourcing/weekly-collection.ts` |
| Bibliothèque des fournisseurs | `src/services/sourcing/source-library.ts` |
| Build iOS sans quota | `.github/workflows/ios-testflight-local.yml` |
