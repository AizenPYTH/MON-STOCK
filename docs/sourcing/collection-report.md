# Rapport des collectes réelles

Ce document ne recense que ce qui a **réellement** fonctionné ou échoué contre les vrais sites, en production. Les tests automatisés sur fixtures n'y figurent pas.

## 1. Tests réels du 13/10/2026 (serveur MON STOCK, Edge Function `api`)

Source : table `sourcing_library_checks`, test de recherche quotidien à 04:23 UTC.

| Source | Méthode | Résultat | Exemple relevé |
| --- | --- | --- | --- |
| Fixje (NL) | catalogue public | **200 produits avec prix** (« iphone 13 ») | iPhone 13 Pro : 252 € |
| Refreshed Apples (NL) | catalogue public (Shopify) | **117 produits avec prix** (« iphone ») | iPhone 8 Used 256 GB grade B : 179 € |
| eBay France | API officielle Browse | **30 produits avec prix** (« iphone 13 128 ») | Apple iPhone 13 128 Go : 182,70 € |
| Brico-phone (FR) | plan du site + JSON-LD | **3 produits avec prix** (« ecran iphone 13 ») | Écran iPhone 13 - Origine Apple : 199,90 € |
| Servisní díly (CZ) | plan du site + JSON-LD | **3 produits avec prix** (« iphone ») | Baterie pro iPhone 7 Plus : 252 CZK |
| Foneday | Shopify | échec : HTTP 404 sur le point d'entrée de recherche | — |
| MobileSentrix EU | Shopify | échec : HTTP 404 | — |
| Mobileparts.shop, iFixit EU, Rewa | WooCommerce | échec : la page renvoie du HTML, pas l'API attendue | — |
| Replace Base | WooCommerce / plan du site | échec : HTTP 202 et plan du site introuvable | — |
| Jobalots | — | refusé : robots.txt interdit l'accès | — |
| Utopya | — | bloqué : CGV article 14 | — |

**Recherches réelles des utilisateurs** (sources activées : Brico-phone, Refreshed Apples, Servisní díly) :
- 13/10, « iphone 12 » : 157 offres trouvées et enregistrées ;
- « iphone 13 » : 93 offres ;
- « iphone 15 pro » : 18 offres.

Durée : de 26 à 46 s, après la correction de l'enregistrement en parallèle (contre 118 s avant).

## 2. Joignabilité de l'annuaire (05:41 UTC, table `supplier_directory_checks`)

- 120 sites contrôlés : **102 joignables** et 18 non.
- Parmi les non joignables : 11 HTTP 403 anti-robot, 3 délais ou erreurs TLS, 1 domaine inexistant, 3 sans site officiel identifié.
- robots.txt interdit tout accès pour 3 sites joignables.
- Plateformes détectées : Shopify, WooCommerce, PrestaShop, Magento, Shopware.

## 3. Ce qui n'a PAS été fait

- Aucun compte créé, aucun devis demandé, aucune commande.
- Aucun nouveau connecteur écrit ni testé pour cette étape. Les 138 fiches « extraits de recherche » ne sont **pas** vérifiées sur le site lui-même : l'environnement de travail bloque l'ouverture directe des pages (proxy, HTTP 403).
- Ingram Micro et BigBuy : adaptateurs écrits et testés sur fixtures uniquement, jamais en réel (aucun compte).
