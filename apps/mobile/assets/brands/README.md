# Logos de marques tierces

Ce dossier ne doit contenir **que des fichiers officiels dont l'usage a été autorisé par écrit** par
la marque concernée. Il est vide à ce jour : aucune autorisation n'est détenue (voir docs/BRANDS.md).

Pour ajouter un logo autorisé :

1. Archiver l'autorisation écrite (e-mail, contrat, conditions du kit) et sa date.
2. Déposer ici le fichier **officiel**, sans retouche : PNG transparent, ou SVG converti en PNG en
   @2x et @3x (par exemple `colissimo.png`, `colissimo@2x.png`, `colissimo@3x.png`). Garder la
   version pour fond sombre si la marque en fournit une (`colissimo-dark.png`).
3. Dans `src/brands/registry.ts` :
   - référencer le fichier dans `LOGOS` (`source: require(...)`, largeur et hauteur d'origine, fond `light` ou `any`) ;
   - passer `usage.status` à `"authorized"` ;
   - mettre à jour `usage.note` (référence de l'autorisation) et `checkedAt`.
4. Mettre à jour le test « aucun logo sans autorisation » (`tests/brands.test.tsx`) et docs/BRANDS.md.
