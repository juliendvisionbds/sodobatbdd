Design system Sodobat v1.0 : une interface de pilotage dense, sobre, orientée chiffres. La page de référence est `reference.html` dans ce dossier (fondations, composants, rédaction) ; le reste en est la traduction pour le code.

## Principes

- **Le chiffre d'abord.** Grands nombres en 600, chiffres tabulaires partout, unité en gris à côté de la valeur.
- **Une seule couleur de marque.** Le pétrole `#0E5A5F` porte l'action, la sélection et la donnée mise en avant. Le reste est neutre chaud.
- **La couleur a un sens.** Vert = favorable, rouge = défavorable, ambre = à vérifier. Jamais décoratif.
- **Des filets, pas d'ombres.** Cartes blanches, filet 1px `border`, rayon 12. Seule ombre : l'option active du contrôle segmenté.

## Fondations

**Couleur.** La page est `canvas`, chaque section une carte `surface` bordée d'un filet `border` ; les lignes se séparent par `hairline`. Les champs, boutons et menus prennent `border-control`. `petrole` : logo, onglet actif, bouton primaire, prix et pourcentages mis en avant, barres actives. `petrole-tint` pour l'avatar et les puces, `petrole-wash` pour le survol d'une option, la ligne sélectionnée et le filtre actif. Les trois tons sémantiques vont par paire texte / fond (`positive`, `negative`, `warning` et leur `-bg`) ; `warning-dot` est le point de statut. Les travaux supplémentaires (TS) prennent le ton `warning`.

**Texte.** `ink` pour le texte et les valeurs, `gris-700` pour le secondaire fort et les codes, `gris-500` pour les libellés, légendes et unités, `gris-400` pour les placeholders et chevrons, `gris-300` pour une valeur vide. Dans les composants, `text-sub` vaut `gris-700` et `text-faint` vaut `gris-500` : les deux passent 4,5:1 sur `surface`.

**Typographie.** Geist pour toute l'interface (400 / 500 / 600 / 700), 14px, interligne 1,5. Geist Mono est réservé aux codes : codes de lot et d'ouvrage, numéros de pièce, raccourcis clavier. Les montants, quantités, dates et pourcentages restent en Geist à chiffres tabulaires. Échelle : KPI 36/600, titre de page 30/600, ratio 22/600, titre de carte 16/600, corps 14, secondaire 13, légende 12, label de section 12/600 en capitales pétrole (+0,06em).

**Mise en page.** En-tête pleine largeur de 64px. Colonne de contenu de `content-width` (1320px), marge `clamp(16px, 3vw, 40px)`, 28px au-dessus du titre, 20px entre les blocs. Ordre d'une vue : titre de page et sa ligne de métadonnées → bandeau de KPI → panneaux → tableau complet en dernier.

**Formes.** 12 pour une carte, 8 pour un bouton, un champ ou un menu, 7 pour un petit bouton, 6 pour une puce, 10 pour un badge compteur, 5 pour le haut d'une barre, 3 pour une barre de progression.

**États.** Survol d'un bouton secondaire : filet et texte pétrole. Survol d'une ligne : `surface-sunken`. Sélection : `petrole-wash`. Focus clavier : anneau pétrole de 2px, décalé de 2px.

## Composants

Les classes sont dans `components/bundle.css` (préfixe `vx-`), copiées dans `app/vision.css` pour l'application. Les briques React correspondantes sont dans `components/Vision.tsx` (`TitrePage`, `RangeeKpi`, `Kpi`, `Panneau`).

| Classe | Rôle |
| --- | --- |
| `vx-header`, `vx-brand`, `vx-tabs`, `vx-tab` | En-tête sur une ligne : marque, onglets soulignés (actif : `aria-current="page"`), période et utilisateur |
| `vx-heading` | Titre de page, chapô, ligne de métadonnées, actions à droite |
| `vx-kpis`, `vx-kpi` | Bandeau de KPI : une seule carte, cellules séparées par un filet |
| `vx-panel`, `vx-panel--flush`, `vx-panel__foot` | Carte ; à ras quand le contenu est un tableau ; pied pour la note de lecture |
| `vx-btn`, `vx-btn--sm` | Bouton primaire 14/500 ; version compacte dans un formulaire dense |
| `vx-btn-outline` | Bouton secondaire de barre d'outils, 13/500 |
| `vx-btn-ghost` | Petit bouton de ligne, 13, rayon 7 |
| `vx-link` | Lien d'action en pétrole, terminé par « → » |
| `vx-input`, `vx-select` | Champs |
| `vx-chip` | Filtre ouvrant un menu (`vx-menu`) ; actif : `aria-pressed="true"` |
| `vx-seg`, `vx-seg__opt` | Contrôle segmenté ; sert aussi de sous-navigation (`aria-current="page"`) |
| `badge` + `b-green` / `b-amber` / `b-red` / `b-neutre` / `b-petrole` | Puce de statut ; `badge--compteur` pour un compteur |
| `vx-tbl` | Tableau : en-tête sur `surface-sunken`, lignes de 12px, colonnes de montants alignées à droite (`vx-r`) |
| `vx-cell-key`, `vx-cell-amount`, `vx-cell-muted` | Valeur mise en avant, montant secondaire, texte secondaire |
| `vx-insight` (+ `--pos`, `--neg`, `--warn`) | Encadré de signal ou de confirmation |
| `vx-alert`, `vx-spinner` | État d'une opération en cours, terminée ou en échec |
| `vx-progress` | Barre de 5px sur `track` |
| `vx-chat`, `vx-bubble`, `vx-suggest` | Assistant : bulle utilisateur en pétrole, réponse sur `surface-sunken` |
| `vx-table__group`, `eyebrow` | Label de section |

## Rédaction et formats

- Français, vocabulaire du métier. Majuscule en début de libellé uniquement.
- Séparateur « · » pour les métadonnées ; flèche « → » pour les liens d'action et les plages.
- Verbes courts à l'infinitif sur les boutons : Exporter, Vérifier.
- Pas d'emoji. Glyphes sobres : ▼ pour un menu, ✓ pour une case.
- Nombres au format fr-FR : espace fine en séparateur de milliers, virgule décimale, espace avant `%` et `€`, unités `k€` / `M€` abrégées.
- Signe moins typographique « − » ; signe « + » explicite pour un écart positif ; « – » pour une valeur absente.

## Fichiers

- `reference.html` : la page du design system, autonome (polices incluses), à ouvrir dans un navigateur.
- `tokens.css` : variables CSS, identiques au bloc `:root` de `app/vision.css`.
- `tokens.json` : les mêmes tokens avec leur usage.
- `components/bundle.css` : les classes `vx-*`, avec l'import des polices pour un usage hors application.
