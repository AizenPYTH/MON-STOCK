# Agrégateurs B2B de distribution IT/électronique et plateformes multi-distributeurs prix/stock (avec API ou flux) — évaluation pour MON STOCK (Snowolff)

> Méthode et limites (à lire avant tout) : recherche faite le 2026-10-15, uniquement sur des pages publiques. **Aucune page n'a pu être ouverte directement** : l'outil de lecture de page renvoyait `getaddrinfo ENOTFOUND` sur tous les domaines testés (itscope.com, icecat.com, developer.ingrammicro.com, stockinthechannel.com), et l'accès HTTP en ligne de commande a été refusé par la politique de l'environnement. Tout ce qui suit vient donc des **extraits renvoyés par le moteur de recherche** pour les pages citées. Les URL sont exactes, mais le texte n'a pas été relu sur la page en direct. Les chiffres doivent être revérifiés sur la page avant toute décision.
> Légende : **CONFIRMED** = page officielle ou documentation de l'éditeur (lue via extrait) ; **ANNOUNCED** = affirmation marketing de l'éditeur ou presse reprenant l'éditeur ; **HYPOTHESIS** = déduction de ma part ; **À CONFIRMER** = information non publique, à demander au fournisseur.

## Synthèse transversale : est-ce qu'UNE plateforme peut remplacer les ~19 connecteurs de MON STOCK ?

### Takeaway
Aucun agrégateur trouvé ne couvre le cœur de l'activité de Snowolff : iPhone reconditionnés par grade, pièces détachées Apple (écrans, batteries, châssis, nappes) et lots ou palettes de retours. Les agrégateurs multi-distributeurs (ITscope, Stock in the Channel, compuBase/EasyStock) couvrent la distribution IT « broadline » (Ingram, TD SYNNEX, ALSO, Exertis, etc.) en produits **neufs**. Surtout, **ils n'affichent les prix d'achat pro personnalisés que si le revendeur a déjà un compte client approuvé chez chaque distributeur**. Ils ne remplacent donc pas l'ouverture de comptes ; ils l'agrègent.

### Cited Findings
- Stock in the Channel : « you will need accounts with distributors/suppliers to benefit fully » ; les prix d'achat diffèrent selon le revendeur, et il faut demander l'accès à chaque fournisseur et être approuvé. Environ 20 fournisseurs (surtout de pièces) approuvent automatiquement. Les non-revendeurs ne voient généralement pas les prix pro. (CONFIRMED, FAQ officielle mais ancienne) — [FAQ Stock in the Channel](https://discover.stockinthechannel.com/frequently-asked-questions/)
- ITscope : pour afficher les prix individuels, il faut ajouter le distributeur au réseau avec **son numéro client chez ce distributeur**. Sans numéro, il faut d'abord s'enregistrer chez le distributeur via son commercial. (CONFIRMED, guide officiel) — [ITscope Guide – Lieferantenkonten](https://guide.itscope.com/kb/einrichten-von-lieferantenkonten/) ; [ITscope Guide – individuelle Preise](https://guide.itscope.com/kb/wie-kann-ich-meine-individuellen-preise-in-itscope-hinterlegen/)
- Icecat Connect normalise des flux de distributeurs (prix, stock) que l'utilisateur reçoit. Ce n'est pas une source de prix en soi (voir section Icecat). (ANNOUNCED) — [Icecat Stock & Pricing](https://icecat.com/stock-and-pricing/)
- Pour les iPhone reconditionnés, je n'ai trouvé chez aucun grossiste européen B2B (SmartChoice, Mobile Depot, MIWO, RecirQ) d'API ou de flux documenté publiquement. Les échelles de grades diffèrent d'un fournisseur à l'autre (A+/A/B/C, A−, OB, PTB/PTG…). — [SmartChoice](https://shop.smartchoice.ee/wholesale-iphones) ; [Mobile Depot](https://www.mobiledepot.eu/) ; [MIWO](https://www.miwo.it/wholesale-refurbished-iphones) ; [RecirQ](https://www.recirqglobal.com/wholesale-used-iphones)
- Pièces détachées smartphone (Mobilax, Utopya) : je n'ai trouvé aucune API ni flux public. — [Mobilax (App Store, via mwm.ai)](https://mwm.ai/apps/mobilax/1599510586) ; [Utopya (IFA)](https://www.ifa-berlin.com/exhibitors/utopya-2)

### Inferences
- HYPOTHESIS : pour MON STOCK, le meilleur modèle reste hybride. On peut ajouter un agrégateur IT (ITscope ou Stock in the Channel) pour la partie « MacBook/iPad/IT neuf » une fois des comptes distributeurs ouverts. On garde les connecteurs spécifiques pour le reconditionné, les pièces et les lots, qui ne sont pas des métiers de distributeurs broadline.
- HYPOTHESIS : un agrégateur ne réduira la maintenance que pour les fournisseurs qu'il couvre déjà. Les ~19 sites actuels (boutiques Shopify/WooCommerce de reconditionneurs et de grossistes en pièces) ne sont très probablement pas des distributeurs référencés chez ITscope ou Stock in the Channel. À vérifier fournisseur par fournisseur dans les annuaires ([annuaire FR SITC](https://ww3.fr.stockinthechannel.com/Distributors/Open)).

### Gaps
- Je n'ai pas pu croiser la liste des 19 fournisseurs actuels de MON STOCK avec les annuaires de distributeurs d'ITscope et de Stock in the Channel (pages non lisibles en direct).

## DistriHUB — vérification de ce que c'est

### Takeaway
Je n'ai trouvé **aucune** plateforme française « DistriHUB » qui agrège des grossistes IT. Le seul « DistriHub » trouvé est un ERP/POS kényan. L'outil français qui correspond à la description (consultation des stocks des grossistes IT) est **compuBase.biz / EasyStockOnLine** (voir plus bas).

### Cited Findings
- DistriHub (Capterra) : « business operating system » (ERP, caisse, stock, achats) pour commerçants, grossistes, pharmacies et hôtels. Pays : Kenya, en anglais seulement, 0 avis. Il propose une fonction « DistriMarket » de commerce entre entreprises. (CONFIRMED pour la fiche annuaire) — [Capterra DistriHub](https://www.capterra.com/p/10043767/DistriHub/) ; [Capterra AU](https://www.capterra.com.au/software/1099095/DistriHub)
- Deux recherches (FR, puis FR + « informatique revendeurs catalogue grossistes ») n'ont fait ressortir aucun acteur français de ce nom dans l'IT. — [Capterra UK DistriHub](https://www.capterra.co.uk/software/1099095/DistriHub)

### Inferences
- HYPOTHESIS : le nom vient peut-être d'une confusion avec compuBase/EasyStock, avec ITscope ou avec un outil interne d'un grossiste. Il peut aussi s'agir d'un acteur très récent ou non référencé.

### Gaps
- À confirmer auprès de l'utilisateur : d'où vient le nom « DistriHUB » (URL, SIREN, salon) ? Sans cela, impossible de conclure.

## ITscope (DE) — plateforme multi-distributeurs prix/stock + API

### Takeaway
C'est le candidat le plus proche de « une plateforme, de nombreux distributeurs, de vrais prix d'achat, une API ». Le site, les tarifs et l'API sont publics. Mais l'outil vise les revendeurs IT et systémiers de la zone DACH. Il faut un justificatif d'entreprise (extrait de registre ou Gewerbeschein), et les prix personnalisés n'apparaissent que si l'on a un compte chez chaque distributeur. La présence de distributeurs **français** n'est pas documentée publiquement.

### Cited Findings
1. **Nom / site** : ITscope GmbH, Karlsruhe, filiale de weclapp SE depuis 2021. (CONFIRMED par la presse) — [itscope.com](https://www.itscope.com/) ; [ChannelPartner – weclapp übernimmt ITscope](https://www.channelpartner.de/article/3902764/weclapp-se-uebernimmt-itscope.html)
2. **Fonctionnement** : plateforme B2B cloud pour revendeurs IT et systémiers. On y compare les distributeurs (prix, stock), on commande via un système de commande avec EDI, et on dispose d'une API, d'une intégration ERP et d'une boutique B2B. Elle affiche les prix standard publiés par un distributeur, ou **les prix individuels** si l'utilisateur a renseigné ses identifiants. (CONFIRMED) — [IT-Distributoren vergleichen](https://www.itscope.com/it-distributoren-vergleichen/) ; [ITscope Guide](https://guide.itscope.com/kb/wie-kann-ich-meine-individuellen-preise-in-itscope-hinterlegen/)
3. **Nombre de distributeurs / catalogue** : les chiffres varient. « Plus de 400 distributeurs en Europe » (2021) ; « environ 340 » (2018) ; selon les pages, « plus de 290 / 300 / 370 ». La plateforme annonce 7 millions de produits avec « vos prix d'achat individuels et vos stocks à jour », et environ 5 000 entreprises clientes. (ANNOUNCED, chiffres contradictoires) — [pressetext 2021](https://www.pressetext.com/news/20210712004) ; [ITreseller 2018](https://www.itreseller.ch/Artikel/87487/Littlebit_am_Bestellsystem_von_Itscope_angebunden.html) ; [itscope.com – vergleichen](https://www.itscope.com/it-distributoren-vergleichen/)
4. **Couverture Snowolff** : IT et électronique neuf (dont Apple via les distributeurs broadline). Je n'ai trouvé aucune mention de smartphones reconditionnés par grade, de pièces détachées Apple ou de lots. (HYPOTHESIS : couverture faible pour le reconditionné et les pièces)
5. **Prix pro réels** : oui, s'ils sont personnalisés par compte. Il faut le numéro client chez le distributeur et les identifiants de prix temps réel ou de liste de prix. Certains distributeurs fournissent un prix temps réel (par ex. Littlebit, ActionIT). (CONFIRMED) — [Guide – Lieferantenkonten](https://guide.itscope.com/kb/einrichten-von-lieferantenkonten/) ; [ChannelPartner – Littlebit/ActionIT](https://www.channelpartner.de/article/3893307/itscope-integriert-littlebit-und-actionit-ins-bestellsystem.html)
6. **Données** : stock, prix, EAN et référence fabricant (le deeplink se fait par EAN ou MPN), fiches produit. Rien n'est publié sur les grades ou l'état « reconditionné ». (CONFIRMED pour EAN/MPN, via presse) — [ChannelPartner – Arbeitserleichterung](https://www.channelpartner.de/article/3897282/arbeitserleichterung-fuer-fachhaendler.html)
7. **API / flux** : l'API ITscope fournit les données produit, prix et marché « maschinenlesbar, z.B. per XML oder JSON ». La presse cite aussi le CSV et la recherche plein texte. Une API de commande permet de récupérer les documents EDI (confirmation de commande, bon de livraison, facture). (CONFIRMED / ANNOUNCED) — [Individuelle API-Integration](https://www.itscope.com/loesungen/itscope-erp-integration/individuelle-api/) ; [ChannelPartner](https://www.channelpartner.de/article/3897282/arbeitserleichterung-fuer-fachhaendler.html) ; [ChannelPartner – Bestell-API](https://www.channelpartner.de/article/3893307/itscope-integriert-littlebit-und-actionit-ins-bestellsystem.html)
8. **Doc technique publique** : je n'ai pas trouvé de portail développeur public avec la liste des endpoints. Un éditeur tiers (Equipme) documente l'intégration : clé « Company Key », liaison par ID produit ITscope, mise à jour des prix chaque matin. — [Equipme – ITscope sync](https://hub.equipme.io/documentation/administration/integrations/it-scope/automatic-price-synchronization-with-itscope.md). Spécification complète : À CONFIRMER.
9. **Conditions d'accès** : plateforme réservée aux professionnels (« auf Gewerbetreibende beschränkt »). Il faut fournir un extrait de registre du commerce ou un Gewerbeschein, la raison sociale et les coordonnées. ITscope peut poser d'autres conditions. (CONFIRMED, CGV de mai 2023) — [ITscope AGB Mai 2023 (PDF)](https://www.itscope.com/wp-content/uploads/2023/05/ITscope-AGB-Mai-2023.pdf)
10. **Coûts** (prix mensuels, **facturation annuelle uniquement**, virement ou prélèvement SEPA) : Essential 51 €, Essential+ 72 €, ERP Integration 189 €, B2B Commerce 369 € par mois. Utilisateur supplémentaire : Core +20 €/mois, Expert +41 €/mois. **API Lite : 104 €/mois pour 5 000 appels par mois au plus**, au-delà sur demande. (CONFIRMED, page tarifs officielle lue via extrait ; à revérifier, HT probable mais non confirmé) — [ITscope Preise](https://www.itscope.com/preise/) ; [ITscope Essential](https://www.itscope.com/loesungen/itscope-essential/)
    - Contradiction : Capterra annonce « dès 49 €/mois, 15 €/utilisateur supplémentaire ». Un article ancien de ChannelPartner évoquait une API gratuite (100 appels) et une version Pro dès 33 €/mois. Ces chiffres sont obsolètes. — [GetApp/Capterra](https://www.getapp.com/all-software/a/itscope/) ; [ChannelPartner (ancien)](https://www.channelpartner.de/article/3897282/arbeitserleichterung-fuer-fachhaendler.html)
11. **Usage dans un logiciel tiers** : c'est possible techniquement. L'API est faite pour l'ERP et les logiciels tiers, et Equipme ou Synesty le font déjà. (CONFIRMED pour le principe) — [Equipme](https://hub.equipme.io/documentation/administration/integrations/it-scope.md) ; [Shopify Community](https://community.shopify.com/t/suche-app-bzw-schnittstelle-produktdatenimport-aus-itscope-zu-shopify/252986)
12. **Conditions d'usage des données** (stockage, redistribution, fréquence) : non trouvées dans les extraits. À CONFIRMER dans les CGV complètes ou auprès d'ITscope. Le quota de 5 000 appels par mois en API Lite limite de fait la fréquence (environ 166 appels par jour).
13. **Commande** : commande depuis la plateforme vers les distributeurs connectés (système de commande, EDI). La facturation reste faite par le distributeur. (CONFIRMED) — [Optimiert bestellen](https://www.itscope.com/loesungen/optimiert-bestellen/)
14. **Géographie** : fort ancrage DACH. Ambition « Kerneuropa » (DACH, Benelux, Italie, Espagne, **France**, Royaume-Uni) annoncée en 2020, lors du rachat de COP Software. Monnaie : EUR. (ANNOUNCED) — [ChannelPartner – COP Software](https://www.channelpartner.de/article/3899408/itscope-uebernimmt-cop-software.html)
15. **Bilan** : avantage, c'est le seul candidat avec des tarifs publics, l'API et la commande. Limites : orienté DACH, en allemand ; prix individuels conditionnés aux comptes distributeurs ; aucune couverture démontrée du reconditionné ou des pièces ; quota d'API serré. Confiance : moyenne-haute sur le fonctionnement, faible sur la couverture France.

### Inferences
- HYPOTHESIS : pour Snowolff, ITscope n'apporte de la valeur que si (a) des distributeurs actifs en France sont connectés et (b) Snowolff obtient des comptes chez eux. Budget plancher réaliste : Essential + API Lite, soit environ 155 €/mois facturés à l'année (environ 1 860 €/an), à confirmer car l'API Lite dépend peut-être du pack ERP Integration.

### Gaps
- Liste des distributeurs français connectés : non trouvée.
- L'API Lite est-elle cumulable avec Essential, ou exige-t-elle le pack ERP Integration ? À CONFIRMER.
- Clauses de stockage et de redistribution des données dans la CGV : non lues.

## Stock in the Channel (UK, présent en France) — agrégateur stock + prix d'achat personnalisés + datafeed

### Takeaway
C'est un vrai agrégateur multi-distributeurs avec une version française (fr.stockinthechannel.com) et des prix d'achat personnalisés. On peut voir les stocks gratuitement. La comparaison de vos prix pro est payante, et le datafeed exportable vers vos propres systèmes coûte « à partir de £300/mois ». Ces prix publics sont anciens.

### Cited Findings
1. Site : [stockinthechannel.com](https://discover.stockinthechannel.com/frequently-asked-questions/) / [fr.stockinthechannel.com](https://fr.stockinthechannel.com/Distributor/Flex-IT-Distribution/11) (CONFIRMED)
2. Fonctionnement : agrège les stocks de nombreux fournisseurs dans une seule recherche, « with accurate stock and prices personalised to you ». On peut exporter vers une boutique en ligne ou des devis, et commander automatiquement par EDI avec suivi. (ANNOUNCED) — [fr.SITC – Flex IT](https://fr.stockinthechannel.com/Distributor/Flex-IT-Distribution/11) ; [fr.SITC – Tech Data](https://fr.stockinthechannel.com/Distributor/Tech-Data-/8)
3. Volume : en France, une page indique **35 fournisseurs et 2,0 millions de produits**. La FAQ (ancienne) indique « plus de 130 distributeurs », le PDF de 2018 « plus de 300 au niveau mondial ». Présent dans 22 pays, plus de 25 000 clients. (ANNOUNCED, chiffres de dates différentes) — [fr.SITC](https://fr.stockinthechannel.com/Distributor/Also-International/27) ; [FAQ](https://discover.stockinthechannel.com/frequently-asked-questions/) ; [PDF 2018](https://discover.stockinthechannel.com/wp-content/uploads/2018/07/Reseller-Services-and-Indicative-Pricing.pdf)
4. Couverture : distribution IT, bureautique et consommables (Tech Data, ALSO, Flex IT, FLP, Server Storage Solutions… sur l'annuaire français). Rien de spécifique au reconditionné par grade, aux pièces Apple ou aux lots. (HYPOTHESIS) — [Annuaire FR](https://ww3.fr.stockinthechannel.com/Distributors/Open)
5. Prix pro : oui, personnalisés, **à condition d'être approuvé par chaque fournisseur**. Les stocks et les prix d'achat personnalisés sont mis à jour chaque jour. (CONFIRMED) — [FAQ](https://discover.stockinthechannel.com/frequently-asked-questions/) ; [fr.SITC – Flex IT](https://fr.stockinthechannel.com/Distributor/Flex-IT-Distribution/11)
6. Données : stock, prix, descriptions normalisées. Grades, état et capacité : non documentés.
7. Flux : datafeed « flat file » ou « multi-file » pour les développeurs, rafraîchi chaque jour ou chaque heure. Il couvre Ingram Micro, Exertis, Arrow, TD SYNNEX et des centaines d'autres. (ANNOUNCED) — [discover.SITC](https://discover.stockinthechannel.com/?p=1135) ; [Datafeed setup (PDF, rév. 4.0)](https://discover.stockinthechannel.com/wp-content/uploads/2018/07/Datafeed-setup-information-1.pdf)
8. Doc technique : PDF « Distributor Feed Instructions and Notes (Revision 4.0) » (ci-dessus). Je n'ai pas trouvé d'API REST publique.
9. Accès : inscription gratuite pour voir le stock. Il faut des comptes chez les distributeurs pour les prix. (CONFIRMED) — [FAQ](https://discover.stockinthechannel.com/frequently-asked-questions/)
10. Coûts (anciens, en GBP) : « Compare Prices » à **£30/mois** après 2 mois d'essai gratuit (FAQ), contre « from £50/month » dans le PDF de 2018. **Web Store / données seules à partir de £300/mois** ; options payantes pour l'automatisation des commandes et l'hébergement. Paiement annuel : 12 mois pour le prix de 10. (CONFIRMED mais daté, à revérifier) — [FAQ](https://discover.stockinthechannel.com/frequently-asked-questions/) ; [PDF 2018](https://discover.stockinthechannel.com/wp-content/uploads/2018/07/Reseller-Services-and-Indicative-Pricing.pdf)
11. Logiciel tiers : le datafeed est prévu pour l'e-commerce, les devis et les systèmes de service client. (ANNOUNCED) — [PDF 2018](https://discover.stockinthechannel.com/wp-content/uploads/2018/07/Reseller-Services-and-Indicative-Pricing.pdf)
12. Conditions d'usage et de redistribution : À CONFIRMER.
13. Commande : par connexions EDI vers les fournisseurs. (ANNOUNCED)
14. Géographie : France, Espagne, Royaume-Uni, etc. (22 pays). EUR en France (HYPOTHESIS).
15. Bilan : le moins cher pour comparer ses propres prix (£30/mois) et il dispose d'une interface française. Le datafeed reste cher pour une micro-structure. Confiance : moyenne, car les sources sont anciennes.

### Inferences
- HYPOTHESIS : c'est l'option la plus réaliste à « tester gratuitement » pour savoir quels distributeurs IT présents en France approuveraient Snowolff.

### Gaps
- Tarifs 2026 en EUR pour la France, et conditions de licence du datafeed : non trouvés.

## compuBase.biz / EasyStockOnLine (FR) — consultation des stocks des grossistes IT

### Takeaway
C'est l'outil français historique de consultation des stocks et des prix des grossistes IT. Il a été adopté en 2023 par la FRP2I (fédération de revendeurs indépendants). Je n'ai trouvé ni API ni tarif public.

### Cited Findings
- EasyStockOnLine est intégré à la place de marché compuBase.biz. Il donne accès à 450 000 références et aux stocks « des plus grands grossistes IT en France et en Europe ». compuBase.biz compte plus de 13 000 abonnés ; accord avec la FRP2I (200 adhérents) en avril 2023. (ANNOUNCED) — [Solutions Numériques – FRP2I](https://www.solutions-numeriques.com/la-federation-des-revendeurs-et-prestataires-informatiques-independants-choisit-compubase-biz-easystock-comme-plateforme-dacces-aux-disponibilites-de-stocks-des-grossistes-it/)
- Page compuBase (non datée) : « 16 distributeurs partenaires », plus de 450 000 références. Partenaires cités : Actebis, TechData, Ingram, EET, Copaco, Xeptor. (CONFIRMED, page éditeur, probablement ancienne puisque Actebis et TechData ont changé de nom depuis) — [content.compubase.biz – EasyStockOnLine](http://content.compubase.biz/fr/qui-sommes-nous/easystockonline) ; [compuBase – Copaco France](https://www.compubase.biz/ict/content.do?link=%2Ffr%2Fqui-sommes-nous%2Feasystockonline%2Fles-grossistes-partenaires%2Fcopaco-france)
- En 2011, 20 grossistes étaient consultables **gratuitement** (stock, prix, fiches). — [ChannelBiz 2011](https://www.channelbiz.fr/2011/01/25/la-plateforme-revendeurs-compubasebiz-easystockonline-accueille-7-nouveaux-grossistes/)

### Inferences
- HYPOTHESIS : c'est plutôt un outil de consultation web pour revendeurs qu'un flux intégrable. Les prix affichés sont probablement des prix grossistes génériques, et non vos conditions personnalisées.

### Gaps
- API ou export, tarifs 2026, prix personnalisés ou non, liste actuelle des grossistes : À CONFIRMER auprès de compuBase.

## Icecat (NL) — données produit, et « Stock & Pricing / Icecat Connect »

### Takeaway
Icecat est d'abord un fournisseur de **fiches produit** (Open Icecat gratuit, Full Icecat payant). « Stock & Pricing / Icecat Connect » est un service de **normalisation des flux prix et stock de distributeurs que vous recevez déjà**. Icecat ne vend pas des prix d'achat de distributeurs auxquels on n'aurait pas accès. Un distributeur peut toutefois choisir de rendre ses fichiers disponibles aux utilisateurs Icecat (cas de VIP Computers).

### Cited Findings
- Icecat Connect importe des flux de plusieurs distributeurs, non standardisés, et les convertit dans un format unique. Champs : MPN, marque, nom, descriptions, catégorie, prix, stock, champs personnalisés. Formats d'entrée : CSV, XLSX, XML. Sortie : FTP hébergé par Icecat, Icecat PIM ou boutiques (Magento, Shopify, WooCommerce, Shopware). Mise à jour jusqu'à chaque heure. (ANNOUNCED) — [Icecat Stock & Pricing](https://icecat.com/stock-and-pricing/) ; [E-commerce data sync](https://icecat.com/e-commerce-data-sync-solution-simplify-stock-and-pricing-management-icecat/)
- Dans le PIM, des règles de prix et de choix du distributeur s'appliquent (par défaut, le moins cher). Les fichiers des distributeurs doivent contenir MPN et marque. (ANNOUNCED) — [Icecat PIM Retailers & Distributors](https://icecat.com/pim-retailers)
- Notes de version 246 : import du prix HT et TTC des distributeurs ; import passé de tous les 3 jours à quotidien. (CONFIRMED, blog éditeur) — [Iceclog Release Notes 246](https://iceclog.com/icecat-published-release-notes-on-platform-efficiency/)
- VIP Computers (distributeur de composants PC, Royaume-Uni) rend ses fichiers prix et stock « disponibles à tous les utilisateurs Icecat » via Icecat Connect. (ANNOUNCED) — [Iceclog – VIP Computers](https://iceclog.com/?p=49815) ; [ChannelWeb – VIP feeds data into VARs](https://www.channelweb.co.uk/news/1873538/vip-feeds-vars)
- Open Icecat : gratuit, sous licence de contenu ouverte, financé par les marques. Full Icecat : payant (Starter, Single Vertical, Complete), factures annuelles, tarifs modifiables sans préavis. (CONFIRMED) — [Iceclog FAQ](https://iceclog.com/faq-for-merchants/) ; [Icecat Subscription Plans 2025](https://iceclog.com/icecat-subscription-plans/)
- Prix tiers, non vérifiés et contradictoires : PIM « dès $450/mois » (Crozdesk) ; « dès 1 500 €/an » (Software Advice) ; Starter 350 €/mois, Vertical 600 €, Complete 3 500 € (Ampifire, environ 2 ans). — [Crozdesk](https://crozdesk.com/software/icecat-pim) ; [Software Advice](https://www.softwareadvice.com/ecommerce/icepim-profile/) ; [Ampifire](https://ampifire.com/blog/icecat-review-pricing/)
- La FAQ cite TD SYNNEX et Ingram Micro comme distributeurs avec lesquels Icecat travaille. — [Icecat FAQ](https://icecat.com/faq/)

### Inferences
- HYPOTHESIS : pour MON STOCK, Icecat est utile pour **enrichir** les fiches (EAN vers specs et images) et éventuellement pour **normaliser** des flux de fournisseurs déjà obtenus. Il ne règle pas l'accès aux prix. Pour le reconditionné et les pièces détachées, la couverture d'Open Icecat est probablement faible (HYPOTHESIS).

### Gaps
- Tarif d'Icecat Connect seul, nombre et pays des distributeurs « publics » dans Connect : non publiés.

## Ingram Micro (Xvantage / XI Reseller API)

### Takeaway
L'API revendeur est officielle et très bien documentée (REST/JSON, OAuth, sandbox, SDK open source). Elle couvre catalogue, prix et disponibilité temps réel par entrepôt, commandes, factures et webhooks. La France fait partie des pays où l'API v6 est ouverte. Mais elle ne sert qu'à un **compte revendeur Ingram Micro actif**, et ne donne que l'offre Ingram (un seul distributeur, pas un agrégateur).

### Cited Findings
1. Site : [developer.ingrammicro.com](https://developer.ingrammicro.com/) (CONFIRMED)
2. Distributeur unique. L'API donne catalogue, prix, remises et stock ; commandes, factures, notifications de statut. (CONFIRMED) — [Portail](https://developer.ingrammicro.com/)
5. Prix : prix et disponibilité **liés à votre numéro de compte client** (prix personnalisés). (CONFIRMED) — [Reseller Getting Started](https://developer.ingrammicro.com/reseller/getting-started)
6. Stock par entrepôt, en temps réel. (CONFIRMED) — [Portail](https://developer.ingrammicro.com/)
7. Technique : REST, **JSON uniquement**, OAuth (endpoint token). Bases sur api.ingrammicro.com (sandbox sous /sandbox/), routes catalogue sous /resellers/v6/ (price & availability, search, product details, order create). Webhook de statut de commande (on hold, invoiced, shipped, voided). L'en-tête **IM-CountryCode** est obligatoire. Attention : remplacer v5 par v6 ne suffit pas, les formats changent. (CONFIRMED) — [FAQ](https://developer.ingrammicro.com/reseller/faq) ; [Request/Response](https://developer.ingrammicro.com/cls/getting-started/request-response)
8. Doc et exemples : spécification OpenAPI et SDK officiels (C#, Java, Node `xi_sdk_resellers`, Python `xi.sdk.resellers`, Go). (CONFIRMED) — [GitHub xi-sdk-openapispec](https://github.com/ingrammicro-xvantage/xi-sdk-openapispec) ; [SDKs](https://developer.ingrammicro.com/reseller/sdks). Un serveur MCP et un « XI Hub » ont été annoncés en août 2026 — [BusinessWire 2026-08](https://www.businesswire.com/news/home/20260805946112/en/) ; [MCP Server](https://developer.ingrammicro.com/reseller/mcp-server) (ANNOUNCED)
9. Accès : compte Ingram actif et en règle ; un seul compte développeur par partenaire, qui autorise votre compte revendeur au canal API. Il faut décrire l'application et le volume estimé, puis attendre l'approbation (environ 2 jours ouvrés côté vendor/partner), avant de recevoir les clés. Exemple tiers : Zomentum renseigne l'e-mail du gestionnaire de compte et attend l'approbation. (CONFIRMED) — [Reseller Getting Started](https://developer.ingrammicro.com/reseller/getting-started) ; [Vendor Getting Started](https://developer.ingrammicro.com/vendor/getting-started) ; [Zomentum](https://help.zomentum.com/support/solutions/articles/44001909124)
10. Coût de l'API : aucun tarif public trouvé. À CONFIRMER (HYPOTHESIS : probablement gratuite pour les clients).
11. Logiciel tiers : oui, prévu pour (PSA, devis, e-commerce : Zomentum, QuoteWerks…). (CONFIRMED)
12. Conditions d'usage, quotas : À CONFIRMER.
13. Commande directe chez Ingram par l'API. (CONFIRMED)
14. France : listée parmi les pays ouverts à Products Search/Details v6 (septembre 2024) et à Quotes v6 (mai 2024). (CONFIRMED) — [APIs Update](https://developer.ingrammicro.com/reseller/new). En 2022, une demande de freelance évoquait une intégration **SOAP** Ingram Micro France pour PrestaShop. Ancien modèle, à ne pas prendre pour l'état actuel — [Codeur.com](https://www.codeur.com/projects/333506-integration-des-api-ingrame-dans-prestashop-1-7-7-7)
15. Bilan : meilleure qualité technique ; un seul fournisseur ; il faut être accepté comme revendeur. Confiance : haute sur la technique.

### Inferences
- HYPOTHESIS : la couverture Apple (iPhone neuf, MacBook, iPad) dépend de l'agrément Apple du revendeur chez Ingram. Je n'ai trouvé aucune offre de reconditionné ou de pièces Apple dans cette API.

### Gaps
- Conditions d'ouverture d'un compte Ingram Micro France (chiffre d'affaires minimum, ancienneté, assurance-crédit) : non publiques.

## TD SYNNEX (Digital Bridge EU, EC Express, StreamOne)

### Takeaway
Il existe un portail développeur européen, « Digital Bridge », avec une Catalogue API (produit, prix, disponibilité) et une gestion des commandes. Les procédures documentées publiquement (EC Express, XML P&A, fichier de prix FTP) sont surtout **américaines**. StreamOne est la plateforme cloud/commerce (API commerce « headless »). C'est un distributeur unique, accessible seulement avec un compte revendeur.

### Cited Findings
- Digital Bridge Europe : Catalogue API (produit, prix, disponibilité) + gestion des commandes. (CONFIRMED) — [TD SYNNEX Digital Bridge EU](https://developer.api.tdsynnex.com/eu) ; [Developer Portal global](https://developer.tdsynnex.com/)
- Aux États-Unis, l'API de prix exige un compte EC Express et une demande d'enregistrement séparée au support. Le XML Price & Availability se demande au commercial. Un fichier de prix FTP peut être demandé depuis le portail. (CONFIRMED pour les États-Unis via doc tierce, inconnu pour l'Europe) — [D-Tools](https://docs.d-tools.cloud/en/articles/8901451-connecting-to-td-synnex-pricing) ; [WooCommerce plugin](https://woocommerce.com/document/td-synnex-price-and-availability-for-woocommerce/) ; [CloudRadial](https://support.cloudradial.com/hc/en-us/articles/30968227620756-Connecting-TD-Synnex-to-Storefront) ; [SDK XML non officiel](https://github.com/bipin0x01/synnex-xml-sdk)
- StreamOne : API commerce pour intégrer les produits TD SYNNEX dans des places de marché de partenaires, connecteurs PSA, architecture d'API ouverte (novembre 2024). (ANNOUNCED) — [BusinessWire 2024](https://businesswire.com/news/home/20241112213300/en/TD-SYNNEX-Elevates-StreamOne%C2%AE-with-New-Commerce-and-Security-Capabilities)
- Entité française : TD SYNNEX France, SIREN 722065638, commerce de gros d'équipements informatiques, siège à Bussy-Saint-Georges. — [Pappers](https://www.pappers.fr/entreprise/722065638) ; [Xerfi](https://www.xerfi.com/etudes-par-entreprise/TD-SYNNEX-FRANCE_722065638)

### Inferences
- HYPOTHESIS : même logique qu'Ingram. Il faut un compte TD SYNNEX France, puis demander l'accès Digital Bridge.

### Gaps
- Doc EU détaillée, coûts et conditions d'ouverture de compte en France : non trouvés (page Digital Bridge non lisible en direct).

## ALSO (CH/DE ; possède Westcoast UK)

### Takeaway
Je n'ai trouvé publiquement que l'ALSO Cloud Marketplace (ACMP) et ses « Marketplace APIs », qui concernent les abonnements cloud. Je n'ai trouvé **aucune doc publique** d'API ou de flux prix/stock pour le matériel. ALSO est présent sur Stock in the Channel FR, ce qui laisse une voie indirecte.

### Cited Findings
- ACMP : les revendeurs créent leur place de marché, choisissent les services cloud, fixent leurs prix ; usage gratuit pour les partenaires. La page US liste des « Marketplace APIs for smooth IT system integration ». (CONFIRMED pour le cloud) — [ALSO Cloud Marketplace](https://also.com/ec/cms5/en_5710/5710/services/digital-services/also-cloud-marketplace/index.jsp) ; [ALSO Cloud US](https://www.also.com/ec/cms5/en_7010/7010/index.jsp) ; [Digital Services](https://www.also.com/ec/cms5/en_5110/5110/services/digital-services/index.jsp)
- ALSO International est référencé sur Stock in the Channel France. — [fr.SITC – ALSO](https://fr.stockinthechannel.com/Distributor/Also-International/27)
- Westcoast (Royaume-Uni) fait désormais partie d'ALSO selon la presse UK ; Westcoast diffuse des « daily stock & price feeds » à ses partenaires. (ANNOUNCED) — [IT Channel Oxygen](https://itchanneloxygen.com/?p=20472) ; [Iceclog – Westcoast content requirements](https://iceclog.com/westcoasts-product-content-requirements-for-brands/)

### Gaps
- API ou flux matériel d'ALSO France, conditions, coûts : À CONFIRMER auprès d'ALSO France.

## Exertis (France rachetée par WE.CONNECT en 2025) et Westcoast

### Takeaway
Exertis France a été rachetée par WE.CONNECT en 2025, et un changement de nom était prévu pour fin 2025. Il n'y a pas d'API revendeur publique. Des flux Exertis existent (via clé API, côté Royaume-Uni) et sont agrégés par Stock in the Channel et Zigaflow.

### Cited Findings
- WE.CONNECT a finalisé le rachat d'Exertis France et d'Exertis Iberia (septembre 2025), avec un nouveau nom commercial prévu d'ici fin 2025. (CONFIRMED, communiqué) — [BusinessWire 2025-09](https://www.businesswire.com/news/home/20250901110121/fr)
- Exertis France utilise un Data Hub Pimcore (GraphQL) et un plugin Icecat pour diffuser ses données vers ses canaux. C'est une architecture interne, pas une API revendeur publique. — [Pimcore – Exertis](https://pimcore.com/fr/clients/exertis_c358809)
- Zigaflow (novembre 2025) : intégration du flux fournisseur Exertis via une clé API fournie par le fournisseur (prix, détails, stock). (CONFIRMED, notes de version tierces) — [Zigaflow release notes](https://zigaflow.com/release-notes/12th-november-2025)
- Exertis Connect (connectique et infrastructure, plus de 10 000 références, livraison en 24 h). — [ChannelBiz 2024](https://www.channelbiz.fr/2024/10/25/exertis-connect-comment-limportateur-connectique-sest-transforme-pour-simposer-en-distributeur-multi-specialiste/embed)

### Gaps
- Nouveau nom d'Exertis France et existence d'un flux pour les revendeurs français : À CONFIRMER.

## Esprinet / V-Valley (IT/ES/PT)

### Takeaway
Premier grossiste IT d'Europe du Sud (environ 130 000 produits, plus de 650 fabricants). Je n'ai trouvé aucune API ni flux revendeur public. Il ne semble pas présent en France comme grossiste broadline.

### Cited Findings
- V-Valley est la branche Advanced Solutions d'Esprinet. Le groupe compte environ 130 000 produits et plus de 650 fabricants, vendus en e-commerce et en télévente ; parcours « Become customer ». (ANNOUNCED) — [Esprinet – V-Valley](https://esprinet.com/en/v-valley/) ; [PDF nouveau site V-Valley 2022](https://www.esprinet.com/wp-content/uploads/2022/11/2022-11-24-V-VALLEY-NUOVO-SITO.pdf)

### Gaps
- API ou flux, et présence en France : non trouvés.

## Komsa (DE)

### Takeaway
Distributeur et prestataire allemand de télécoms. Il reconditionne ou répare plus d'un million d'appareils par an à Hartmannsdorf et veut se renforcer sur le reconditionné. Je n'ai trouvé aucune interface B2B publique.

### Cited Findings
- Komsa veut peser davantage dans le rachat, le reconditionnement et la vente de smartphones d'occasion ; plus d'un million d'appareils réparés ou reconditionnés par an. (ANNOUNCED, presse) — [Schwäbische](https://www.schwaebische.de/wirtschaft/rohstoff-altes-handy-3679)

### Gaps
- Portail B2B, flux, accès depuis la France : À CONFIRMER. Komsa est intéressant pour le reconditionné, mais il n'existe aucune donnée publique d'intégration.

## 1WorldSync (ex-CNET Content) et Etilize — données produit uniquement

### Takeaway
Ce sont des fournisseurs de **contenu produit** (descriptions, specs, images), sans prix ni stock de distributeurs dans les sources trouvées. Ils ne sont pas pertinents pour les prix d'achat.

### Cited Findings
- 1WorldSync DataSource (ex-CNET) : 12 millions de produits, 36 marchés, 18 langues. (ANNOUNCED) — [Akeneo – 1WorldSync connector](https://apps.akeneo.com/apps/1worldsync-connector-formerly-cnet)
- Etilize (GfK Etilize) : descriptions, attributs, textes marketing, images dans une structure normalisée. (ANNOUNCED) — [Eaton – Product Data Syndication](https://www.poweradvantage.eaton.com/sites/us/public/ProductDataSyndication.aspx)
- Prix 1WorldSync : « $500–2 000/mois », une estimation de benchmark et non un devis (non fiable). — [SoftwareFinder](https://softwarefinder.com/ecommerce-software/1worldsync)

### Gaps
- Propriétaire actuel de 1WorldSync : les sources se contredisent (Syndigo ou Roper). Non résolu.

## Autres plateformes repérées (hors IT broadline)

### Takeaway
Pour le téléphone d'occasion ou reconditionné, gsmExchange est une place de marché B2B de négoce avec adhésion contrôlée, sans API documentée. Pour les composants électroniques, Nexar/Octopart est un vrai agrégateur multi-distributeurs avec API GraphQL, mais hors du périmètre de Snowolff.

### Cited Findings
- gsmExchange (Dublin) : marketplace B2B de téléphones et d'accessoires ; adhésion vérifiée (historique de négoce et 2 références de membres). Sous-plateforme phoneLot pour les petits acheteurs, à 25 € (vers 2010, obsolète). Je n'ai pas trouvé d'API. — [Mobile News – gsmExchange](https://mobilenewscwp.co.uk/features/article/grey-matters-work-for-gsmexchange/) ; [Mobile News – clearing house](https://mobilenewscwp.co.uk/features/article/global-market-clearing-house/)
- Nexar (Octopart) : API GraphQL (api.nexar.com/graphql), identifiants via portal.nexar.com. Elle renvoie les paliers de prix des distributeurs agréés et des brokers, le stock et les délais. Plan Evaluation gratuit jusqu'à 1 000 pièces correspondantes (100 avec une adresse e-mail personnelle) ; plans payants non publiés. (CONFIRMED) — [Nexar API](https://nexar.com/api) ; [Octopart API terms](https://octopart.com/api/terms) ; [Altium – Octopart API](https://www.altium.com/documentation/altium-developer-center/octopart/api)

### Inferences
- HYPOTHESIS : Nexar ne concerne que les composants électroniques (CI, connecteurs de carte). Il n'est pas adapté aux pièces de réparation de smartphones ni aux appareils finis.

### Gaps
- PhoneTrade : rien trouvé.

## Accès réaliste pour une micro-entreprise ou une petite SAS française

### Takeaway
Les agrégateurs (ITscope, Stock in the Channel) sont **techniquement accessibles** à une petite société immatriculée, avec un justificatif d'entreprise et un abonnement modeste. Le vrai verrou est **l'approbation de chaque distributeur** (Ingram, TD SYNNEX, ALSO…) pour obtenir des prix pro. Pour une micro-entreprise non assujettie à la TVA, c'est probablement difficile. Une petite SAS avec Kbis, numéro de TVA intracommunautaire et quelques mois d'activité a plus de chances (HYPOTHESIS).

### Cited Findings
- ITscope : réservé aux professionnels, avec extrait de registre ou Gewerbeschein. — [ITscope AGB 2023](https://www.itscope.com/wp-content/uploads/2023/05/ITscope-AGB-Mai-2023.pdf)
- Stock in the Channel : les fournisseurs approuvent les demandes, et certains refusent les non-revendeurs. — [FAQ](https://discover.stockinthechannel.com/frequently-asked-questions/)
- Ingram : un compte actif et en règle est obligatoire avant l'accès à l'API. — [Reseller Getting Started](https://developer.ingrammicro.com/reseller/getting-started)
- Exemple de grossiste IT français (MC2IT) : formulaire signé et tamponné, Kbis de moins de 3 mois (ou avis de situation INSEE pour un entrepreneur individuel), RIB, papier à en-tête, pièces d'identité. — [MC2IT – Ouverture de compte](https://www.grossiste-informatique.com/ouverture)
- Une micro-entreprise n'est pas assujettie à la TVA par défaut, donc n'a pas automatiquement de numéro de TVA intracommunautaire. — [Excilio](https://www.excilio.fr/post/numero-tva-intracommunautaire-obtention) ; [Kbis.online](https://www.kbis.online/tva-intracommunautaire/)

### Inferences
- HYPOTHESIS : ordre de démarche conseillé :
  1. Créer gratuitement un compte Stock in the Channel FR pour voir quels distributeurs couvrent les références Apple et IT de Snowolff.
  2. Demander des comptes à 2 ou 3 distributeurs qui acceptent les petits revendeurs.
  3. Seulement ensuite, évaluer ITscope (environ 155 €/mois facturé à l'année) ou l'API directe Ingram ou TD SYNNEX (gratuite a priori, mais limitée à un seul fournisseur).
- HYPOTHESIS : pour le reconditionné, les pièces et les lots, aucun agrégateur ne dispense de connecteurs spécifiques. Les connecteurs actuels de MON STOCK restent nécessaires.

### Gaps
- Je n'ai trouvé aucune information publique sur les seuils (chiffre d'affaires minimum, ancienneté, assurance-crédit) d'Ingram Micro France, TD SYNNEX France ou ALSO France pour ouvrir un compte revendeur. À CONFIRMER auprès de chaque distributeur.
