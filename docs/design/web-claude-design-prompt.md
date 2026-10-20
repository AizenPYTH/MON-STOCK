# Prompt Claude Design — MON STOCK web (application + site public)

> À coller tel quel dans Claude Design. Joindre si possible : le handoff mobile v5 « Instrument »
> (zip précédent) et 3–4 captures de l'application iPhone actuelle.

---

## Contexte

MON STOCK est un outil de gestion de stock et de sourcing pour les **revendeurs de téléphones et
pièces détachées** (reconditionné, écrans, batteries, accessoires) qui vendent sur eBay et en
boutique. Une application iPhone existe déjà avec le design system **v5 « Instrument »** que tu as
conçu. Il faut maintenant **le site web** : l'application web complète (même compte, mêmes données,
même organisation) et un petit site public.

L'utilisateur type : un revendeur seul ou une petite équipe (2–5 personnes), en France, qui gère
des centaines à des milliers de références (ex. « iPhone 15 Pro 128 Go Noir Grade A », « Écran
iPhone 13 OLED »). Sur ordinateur il veut : **voir beaucoup de lignes d'un coup, comparer, trier,
importer des fichiers fournisseurs, préparer ses achats**. Le mobile sert au terrain, le web au
bureau.

Langue : **français uniquement**. Monnaie : EUR (d'autres devises converties, affichées « ≈ »).

## Direction : reprendre v5 « Instrument », adaptée au grand écran

Garde l'identité v5 à l'identique (c'est la même marque) :

- **La scène nuit et le papier.** Bleu nuit `#101C2C` (scène) / papier `#F2F4F7` / cartes blanches
  à filet `#E6EAF0`, **sans ombre**. Sur desktop, la scène nuit devient un **bandeau d'en-tête de
  page** (pas plein écran) qui porte LE chiffre de la page en grands chiffres fins + au plus un
  graphique-signature ; le papier porte les tableaux et listes.
- **Couleur = signal.** Menthe `#8BE8BE` = action principale / positif sur nuit (jamais en texte sur
  blanc) ; vert `#1E7F57` = marge positive sur papier ; ambre `#E5A34D` (texte `#8A5A12`) = demande
  une action ; rouge `#DC5A5A` (texte `#B03A3A`) = perte, rupture, erreur ; bleu = information.
- **Typographie.** Manrope (300 pour les grands chiffres, 500–800 pour le texte) + **Geist Mono**
  (titres de section en capitales, étiquettes de relevés, SKU, âges des prix). Chiffres tabulaires
  partout.
- **Signatures.** Le **code-barres du stock** (une barre par référence, largeur = ventes 30 j,
  couleur = niveau), les **14 jours de CA** (barres, jour en cours en contour menthe), la **règle de
  marché** (coût rendu face à la médiane du marché, −40 % … +20 %), la **cascade de marge**, le
  **score /100**.
- **Données honnêtes (non négociable).** Chiffre nu = certain ; « ≈ » = estimation (atténué devant
  le chiffre) ; « — » = inconnu (jamais 0) ; « provisoire » = marge sans tous les coûts ; l'âge d'un
  prix est toujours visible (« prix il y a 2 jours ») ; badge « DÉMO » sur une organisation de
  démonstration. Aucun faux bouton, aucune fonction suggérée qui n'existe pas.

Ce qui change pour le web :

- **Navigation latérale** (sidebar) repliable : logo mot-symbole 5 barres, sélecteur
  d'organisation, sections (voir plus bas), compte en bas. Barre du haut fine : recherche globale
  **⌘K** (produits, SKU, fournisseurs, offres, pages), notifications/alertes, bouton « + Ajouter ».
- **Tableaux denses** comme élément central : en-têtes collants, tri, filtres en « puces »,
  sélection multiple + barre d'actions groupées, colonnes configurables, pagination ou défilement,
  densité confortable/compacte, ligne survolée, ouverture d'un **panneau latéral** de détail sans
  quitter la liste (pattern liste + panneau).
- **Mises en page larges** : 1440 px de référence, grille 12 colonnes, contenu max ~1280 px pour
  les pages de lecture, pleine largeur pour les tableaux. Responsive jusqu'à 1024 (tablette) et
  390 (mobile web : la sidebar devient une barre d'onglets en bas comme l'app).
- **Raccourcis clavier** visibles (⌘K, « / » pour chercher, « N » nouveau, Échap ferme le panneau),
  focus visibles, tout utilisable au clavier.
- **Mouvement** sobre (transform/opacity seulement, 160–320 ms, courbe « instrument »
  0.22,1,0.36,1), respect de « réduire les animations ».

## Écrans à concevoir

### A. Site public (non connecté)

1. **Accueil** (`/`) : promesse en une phrase, ce que fait l'outil (stock multi-canal eBay,
   recherche chez les fournisseurs avec analyse « bonne affaire », radar des ruptures, imports de
   catalogues, outils du revendeur), visuels construits avec les vrais composants (code-barres,
   règle de marché, cascade de marge — données d'exemple clairement présentées comme exemple),
   section « Sur iPhone » (TestFlight / App Store à venir), FAQ courte, pied de page légal.
   **Pas de page tarifs** (offre non définie) ; **pas de faux témoignages ni de faux logos clients**.
2. **Connexion / Inscription / Mot de passe oublié / Nouveau mot de passe / Invitation à rejoindre
   une organisation / Onboarding** (créer l'organisation, devise, premier pas).
3. **Pages légales** : Confidentialité, Mentions légales, Conditions d'utilisation, Support /
   contact (gabarits typographiques sobres, sommaire latéral).
4. **404 / erreur / maintenance.**

### B. Application web (connecté)

Navigation proposée (à valider/améliorer) :
**Aujourd'hui · Stock · Ventes · Sourcing · Fournisseurs · Outils · Conseiller · Analyse · Réglages**

1. **Aujourd'hui** : scène = CA du jour (comptage), relevés (ventes à expédier, marge estimée, hier),
   14 jours de CA ; code-barres du stock (ruptures/faibles) ; « À faire maintenant » (rupture la
   plus coûteuse + meilleure offre rapprochée + brouillon de commande) ; liste des tâches ;
   raccourcis ; dernier import ; check-list de démarrage (organisation neuve).
2. **Stock** : tableau des références (photo, titre, SKU, catégorie, quantité, couverture en jours,
   ventes 30 j, coût, prix, marge, canal, niveau), filtres par niveau (code-barres cliquable),
   catégories (Téléphones, Écrans, Batteries, Protections, Accessoires…), recherche ; actions
   groupées (ajuster, exporter).
   - **Fiche SKU / produit** (panneau + page) : historique des mouvements, annonces eBay, ventes,
     meilleure offre fournisseur, ajustement de stock.
   - **Créer / modifier un produit multi-variantes** (capacité, couleur, grade) + **brouillon dicté
     à la voix / texte** (l'IA remplit, l'utilisateur valide).
   - **Alertes de stock.**
3. **Ventes** : commandes (multi-devises), statut d'expédition, détail commande avec les
   mouvements de stock qu'elle a créés ; préparation d'annonce eBay (pré-remplissage, contrôles ;
   publication verrouillée tant que non activée).
4. **Sourcing** :
   - **Recherche fournisseurs** : champ unique, résultats groupés par catégorie détectée
     (Appareils / Écrans / Batteries / Protections…), tri « moins cher » / « meilleures affaires »,
     vue tableau ou cartes, sur chaque offre : fournisseur (logo), prix converti, stock, âge du
     prix, **règle de marché**, niveau d'affaire (Très intéressant / Intéressant / Non compétitif /
     données insuffisantes), marge ≈. Fournisseurs consultés en direct + ceux sans réponse.
   - **Panneau d'analyse d'une offre** : cascade de marge (prix fournisseur → frais → coût rendu →
     revente → marge), points à vérifier, « Voir l'offre » chez le fournisseur.
   - **Radar d'opportunités** : liste des ruptures/stock faible × offres rapprochées, score /100,
     verdict, détail avec scénarios de quantité (1 / MOQ / couverture 30 j), offres concurrentes,
     **brouillon de commande** (rien n'est envoyé au fournisseur), réglages des coûts (TVA,
     commission marketplace, transport…).
   - **Correspondances à valider** (offre ↔ SKU) : file de décision rapide au clavier.
   - **Imports de catalogues** (CSV / XLSX / XML / JSON) : assistant en étapes (fichier → aperçu
     → correspondance des colonnes → mode → confirmation), historique, rapport d'erreurs par ligne,
     répartition importées / ignorées / en erreur.
   - **Sources & flux** : flux autorisés (URL), fréquence de synchro, « synchroniser maintenant »,
     état de la dernière synchro, sources en recherche directe.
5. **Fournisseurs** :
   - **Annuaire** (150+ fournisseurs qualifiés : mur de logos, filtres pays / catégorie / accès,
     statut « actif / à contacter / compte requis »), **fiche fournisseur** (frise d'avancement,
     conditions, e-mail de demande d'accès prêt à copier, offres, performance).
   - **Mes comptes pro** (connexion à un compte fournisseur : API, liste de stock, flux ;
     identifiants chiffrés côté serveur ; état réel de chaque connexion).
   - Commandes fournisseur et performance.
6. **Outils** : calculateurs TVA, marge, prix de vente, remise, **frais eBay**, **convertisseur de
   devises** (taux BCE datés + frais bancaires), **comparateur d'expédition** (devis Sendcloud /
   Boxtal ou tarifs saisis), **suivi de colis** (liste, ajout par numéro/scan, événements). Sur
   desktop : calculateurs côte à côte, résultats en direct, historique récent.
7. **Conseiller IA** : conversation (texte ; voix sur mobile), réponses appuyées sur les vraies
   données (tableaux/chiffres cités), **actions préparées à confirmer** (carte « Confirmer /
   Annuler », jamais exécutées seules), historique, quota visible. Sur desktop : panneau
   ouvrable depuis n'importe quelle page en plus de la page dédiée.
8. **Analyse** : 7 / 30 / 90 jours — CA, marge, meilleures ventes, ruptures coûteuses, marges par
   SKU et par canal, recommandations de réassort.
9. **Réglages** : organisation (identité, devise, frais par canal), membres et invitations
   (rôles), intégrations (eBay : connexion, synchro, catalogue, correspondance des annonces non
   rattachées), historique de synchro + détail d'un passage, coûts du radar, diagnostic,
   facturation (« bientôt » sobre, pas de faux plan).

### C. États à couvrir partout

Chargement (squelettes), vide (premier usage, avec l'action suivante réelle), erreur (encadré
filet rouge, message clair, « Réessayer »), hors ligne, droits insuffisants (lecture seule),
organisation de démonstration, données partielles (« provisoire », « — »), listes très longues
(1 000+ lignes), titres très longs, petits écrans.

## Livrables attendus (même format que le handoff mobile v5)

1. **Prototype HTML** navigable : desktop 1440 et 1024, mobile web 390, pour chaque écran listé
   (au minimum : Accueil public, Connexion, Aujourd'hui, Stock + panneau SKU, Recherche
   fournisseurs + analyse, Radar + détail, Import (assistant), Annuaire + fiche, Outils,
   Conseiller, Réglages).
2. **Spécification** (markdown) : jetons (couleurs, rayons, espacements, ombres, typographie web en
   rem), grille et points de rupture, composants (anatomie, états, variantes, accessibilité),
   motifs (liste + panneau, assistant en étapes, actions groupées, ⌘K), mouvement (durées,
   courbes), règles des données honnêtes, textes types.
3. **Correspondance écran → données** : pour chaque bloc, la donnée affichée et son unité.
4. Contraintes d'implémentation à respecter : **Next.js (App Router) + React 19 + Tailwind CSS v4**
   (variables CSS), icônes **lucide**, graphiques en **SVG** simples (pas de bibliothèque lourde),
   polices auto-hébergées, contraste **WCAG AA**, cibles ≥ 40 px au pointeur / 44 px au toucher,
   aucune donnée factice dans les écrans réels (les exemples du site public sont étiquetés
   « exemple »).

Merci de signaler explicitement tout écart par rapport à v5 et toute fonction que tu proposes en
plus (elle ne sera implémentée que si les données existent).
