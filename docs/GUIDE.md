# Guide d'utilisation — Base de prix d'ouvrages Sodobat

Une page pour prendre l'outil en main. Deux profils : le **métreur**
(consulter) et la **direction / administrateur** (importer, valider).

## 1. Se connecter

Ouvrir l'adresse de l'application et saisir votre **code d'accès
personnel**. Un code par personne : il peut être révoqué sans toucher aux
autres. La session reste ouverte 30 jours sur le même navigateur.

## 2. Trouver un prix (Tarifs ouvrages)

- **Recherche** : tapez un mot du libellé (« ipn », « dalle », « ferraillage »).
  Les fautes de frappe des devis d'origine sont tolérées.
- **Filtres** : lot et sous-lot, zone, période, normaux / TS, unité,
  fiabilité, n minimum.
- **Lecture d'une ligne** : le **prix de référence** est la médiane des
  lignes de devis rattachées à l'ouvrage, jamais une estimation. À côté :
  - la **réglette** montre la fourchette des prix d'un coup d'œil ;
  - **ⓘ** donne le prix bas et le prix haut (la moitié des devis se situe
    entre les deux), la moyenne, le minimum, le maximum et le nombre de
    chantiers ;
  - le badge **TS** apparaît quand des travaux supplémentaires ont été
    chiffrés : un TS est facturé à chaud, en petite quantité, il est plus
    cher et compté à part. Survolez le badge pour son prix ;
  - **n** = nombre de lignes de devis retenues. n ≥ 10 avec dispersion
    faible : fiable. 4 à 9 : à confirmer. Moins : peu de données.
- **Prix actualisés / prix bruts** (en haut à droite) : les prix actualisés
  sont ramenés à aujourd'hui par l'index BT01. Tant que l'index n'est pas
  chargé, les deux valeurs sont identiques.
- Par défaut, les ouvrages sans aucune ligne validée sont masqués. Filtre
  **Affichage → Afficher les ouvrages sans prix** pour les voir.

## 3. Lire une fiche ouvrage

Cliquez sur une ligne du tableau. La fiche donne : prix médian avec n et
fiabilité, réglette grand format, prix par zone (grisé si trop peu
d'occurrences), évolution dans le temps, effet quantité (le PU d'un
chantier de 500 m² n'est pas celui d'un chantier de 20 m²), ouvrages
souvent facturés ensemble, et les **lignes sources** : chaque prix est
traçable jusqu'au devis d'origine (lien « Pièce »). Une ligne marquée
« à revoir » vient d'une pièce dont le total imprimé ne tombe pas juste,
mais elle est cohérente en elle-même et compte.

L'administrateur peut **écarter** une ligne aberrante des statistiques
(motif demandé) et la réintégrer ensuite.

## 4. Historique des chantiers

Tous les documents importés, verbatim, sans moyenne. Deux modes : par
pièce (dépliable, avec lien vers le fichier d'origine) ou par ligne. La
recherche client tolère les fautes (« coproprieté croi du sud »).

## 5. Assistant IA

Posez une question en français : « Combien facture-t-on le m² de dalle
béton en 2025 ? », « Quels ouvrages accompagnent les IPN ? ». L'assistant
n'invente rien : il interroge la base avec les mêmes calculs que le
tableau, cite le n et la période, et affiche ses sources sous la réponse.

## 6. Export

Bouton **Exporter en CSV** au-dessus du tableau : la grille filtrée, prête
pour un tableur.

## 7. Pour la direction : importer et valider

### Importer une pièce
Onglet **Import** : déposez un ou plusieurs devis (PDF, XLS, XLSX, ODS).
Chaque fichier est archivé, lu par l'IA, contrôlé (quantité × PU = total ?)
puis inséré. Une pièce « à revoir » n'est pas une erreur : son total
imprimé ne correspond pas à la somme des lignes (remise, arrondi, ligne
oubliée). Ses lignes cohérentes comptent déjà dans les prix.
Les fichiers de plus de 4 Mo passent par l'import en ligne de commande.

### Valider le calage
Onglet **Calage**. Le calage confirme qu'une ligne de devis correspond
bien à tel ouvrage. Une ligne ne compte dans les prix qu'une fois validée.

- **Par ouvrage** (par défaut) : un panneau par ouvrage avec toutes ses
  lignes en attente. « Tout valider » si la proposition est bonne pour
  toutes ; cases à cocher pour une partie ; « Changer d'ouvrage » pour
  une ligne mal rattachée.
- **Ligne à ligne** : pour les cas ambigus. Au clavier : **V** valider,
  **M** changer la cible, **N** créer un ouvrage, **→** passer.
- **Z** annule le dernier geste, quel que soit l'onglet.
- **Documents à revoir** : voir la pièce d'origine, **Accepter** (le total
  est jugé juste), **Rejeter** avec motif (toutes ses lignes sortent des
  prix), cocher **TS** si la pièce est un devis de travaux supplémentaires.
- **Doublons** : deux ouvrages qui désignent la même prestation ; fusionner
  (confirmation demandée) ou ignorer.
- **Sans ouvrage** : lignes à prix qu'aucune proposition n'a couvertes ;
  rattacher à un ouvrage existant (en une fois pour toutes les désignations
  identiques) ou créer l'ouvrage.
- **Référentiel** : corriger le libellé, le lot, l'unité d'un ouvrage ;
  fusionner deux ouvrages à la main.

Une partie des propositions a été validée automatiquement (mention
« auto ») quand l'IA était très sûre. Filtre **Méthode → Validées
automatiquement** dans « Par ouvrage » pour les relire.

## 8. Ce que l'outil ne fait pas

- Il n'estime pas un prix : sans ligne de devis validée, pas de prix.
- Il ne moyenne pas sans dire combien de lignes entrent dans le calcul.
- Il ne corrige jamais une désignation d'origine : le verbatim est conservé,
  seul l'ouvrage canonique est propre.
