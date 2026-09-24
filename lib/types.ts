// =====================================================================
// SODOBAT — 05_types.ts
//
// CONTRAT UNIQUE. Interface, couche de requêtes et outils du chat
// consomment ces types-là et pas d'autres. Aucun type structurel
// (`{ prix: number, n: number }`) déclaré ailleurs dans le repo.
//
// Règle : si une donnée doit être affichée, elle a un type ici. Si tu as
// besoin d'un champ absent, ajoute-le ici d'abord, puis à la vue SQL.
// =====================================================================

// ---------------------------------------------------------------------
// Primitifs
// ---------------------------------------------------------------------

export type UUID = string;
export type ISODate = string;      // 'AAAA-MM-JJ'
export type ISODateTime = string;

/** Toujours en euros HT. Aucun montant TTC ne circule dans l'application. */
export type EuroHT = number;

export type CodeUnite =
  | "m2" | "ml" | "m3" | "u" | "kg" | "h" | "j" | "ens" | "forfait";

export type CodeZone = "06" | "MERCANTOUR" | "TOULON" | "83_AUTRE";

export type TypeDocument = "devis" | "facture" | "situation" | "avenant";
export type StatutDocument = "importe" | "a_revoir" | "valide" | "rejete";

/** Filtre utilisateur. `tous` agrège normaux + TS. */
export type TypeTravaux = "normaux" | "ts" | "tous";

export type Fiabilite = "haute" | "moyenne" | "faible";

/**
 * Niveau d'agrégation de `mv_stats_ouvrage`.
 * PIÈGE : les trois niveaux coexistent dans la même vue. Toute requête
 * filtre explicitement sur `niveau`, sinon les lignes se recouvrent et
 * les totaux sont faux sans être visiblement absurdes.
 */
export type NiveauStat = "global" | "type" | "zone";

export type MethodeRattachement = "embedding" | "llm" | "manuel" | "regle";

/** Contrôle arithmétique d'une ligne : quantité × PU = total imprimé ? */
export type ControleLigne = "ok" | "ecart" | "non_verifie" | "non_verifiable";

// ---------------------------------------------------------------------
// Pagination et tri
// ---------------------------------------------------------------------

export interface Page<T> {
  lignes: T[];
  total: number;
  page: number;
  parPage: number;
  /** Vrai si `total` est une estimation (comptage approché au-delà de 50 000). */
  totalApproche: boolean;
}

export interface Tri<C extends string> {
  colonne: C;
  sens: "asc" | "desc";
}

export type ColonneTriPrix =
  | "libelle" | "lot" | "unite"
  | "prix_normaux" | "prix_ts"
  | "n" | "dispersion" | "derniere_occurrence";

// ---------------------------------------------------------------------
// Filtres
// ---------------------------------------------------------------------

/**
 * Objet de filtre unique, partagé par le tableau, la fiche, l'historique
 * et les outils du chat. Sérialisable dans l'URL : l'état de l'écran est
 * toujours partageable par simple copie du lien.
 */
export interface FiltresPrix {
  recherche?: string;
  lotId?: UUID;
  /** Inclut les sous-lots de `lotId`. Défaut : true. */
  inclureSousLots?: boolean;
  zones?: CodeZone[];
  typeTravaux?: TypeTravaux;          // défaut 'tous'
  unites?: CodeUnite[];
  depuis?: ISODate;
  jusquA?: ISODate;
  nMinimum?: number;
  fiabiliteMinimum?: Fiabilite;
  /** Défaut true : les prix affichés sont ramenés à aujourd'hui. */
  indexe?: boolean;
  /** Défaut false : les ouvrages forfaitaires ont leur propre écran. */
  inclureForfaits?: boolean;
  /** Défaut false : le tableau masque les ouvrages sans aucune occurrence. */
  inclureSansPrix?: boolean;
}

export const FILTRES_DEFAUT: Required<
  Pick<FiltresPrix, "typeTravaux" | "indexe" | "inclureForfaits" | "inclureSousLots">
> = {
  typeTravaux: "tous",
  indexe: true,
  inclureForfaits: false,
  inclureSousLots: true,
};

// ---------------------------------------------------------------------
// Référentiel
// ---------------------------------------------------------------------

export interface Lot {
  id: UUID;
  code: string;                     // 'GO', 'GO.BA', 'CM'
  libelle: string;
  parentId: UUID | null;
  ordre: number;
}

export interface LotNoeud extends Lot {
  enfants: LotNoeud[];
  /** Ouvrages de ce lot seul. */
  nbOuvrages: number;
  /** Ouvrages de ce lot et de toute sa descendance. Affiché dans le rail. */
  nbOuvragesCumule: number;
  /** Ouvrages ayant au moins une ligne comptée dans les prix. */
  nbAvecPrix: number;
  nbAvecPrixCumule: number;
}

export interface Ouvrage {
  id: UUID;
  code: string | null;
  lotId: UUID | null;
  lotCode: string | null;
  lotLibelle: string | null;
  /** À afficher partout, sauf dans l'écran de calage. */
  libelleDevis: string;
  /** Interne, sert au rapprochement. Visible uniquement dans /calage. */
  libelleNormalise: string;
  descriptionLongue: string | null;
  notesSpecifiques: string | null;
  unite: CodeUnite | null;
  estForfaitaire: boolean;
  actif: boolean;
}

// ---------------------------------------------------------------------
// Statistiques — LE type central
// ---------------------------------------------------------------------

/**
 * Bloc statistique d'un ouvrage sur un périmètre donné.
 *
 * Contient TOUJOURS les valeurs brutes ET indexées. La bascule
 * « prix actualisés / prix bruts » de l'interface ne déclenche donc
 * aucune requête : elle change la clé lue. Ne jamais dupliquer ce type
 * en une variante « brute » et une variante « indexée ».
 */
export interface StatsPrix {
  ouvrageId: UUID;
  niveau: NiveauStat;
  /** null au niveau 'global'. */
  estTs: boolean | null;
  /** null aux niveaux 'global' et 'type'. */
  zone: CodeZone | null;

  /** Nombre de lignes source retenues. Jamais affiché sans lui. */
  n: number;
  nChantiers: number;

  min: EuroHT;
  max: EuroHT;
  moyenne: EuroHT;
  mediane: EuroHT;

  /**
   * null quand n < 4 : les quartiles ne veulent rien dire en dessous.
   * La réglette doit gérer ce cas (voir 06_composants.md).
   */
  quartiles: { p25: EuroHT; p75: EuroHT } | null;

  ecartType: number | null;
  /** Coefficient de variation. null si n < 2. */
  coefVariation: number | null;

  medianeIndexee: EuroHT;
  moyenneIndexee: EuroHT;
  minIndexe: EuroHT;
  maxIndexe: EuroHT;
  quartilesIndexes: { p25: EuroHT; p75: EuroHT } | null;

  premiereOccurrence: ISODate;
  derniereOccurrence: ISODate;
  quantiteCumulee: number | null;

  fiabilite: Fiabilite;
  /**
   * false si au moins un document du périmètre a une zone déduite de
   * l'adresse client. Doit être signalé dans l'interface, jamais masqué.
   */
  zoneToujoursFiable: boolean;
}

/** Sélecteur unique des valeurs à afficher. À utiliser partout. */
export function valeurs(s: StatsPrix, indexe: boolean) {
  return indexe
    ? { min: s.minIndexe, max: s.maxIndexe, mediane: s.medianeIndexee,
        moyenne: s.moyenneIndexee, quartiles: s.quartilesIndexes }
    : { min: s.min, max: s.max, mediane: s.mediane,
        moyenne: s.moyenne, quartiles: s.quartiles };
}

/** Ligne du tableau principal. */
export interface OuvrageResume {
  ouvrage: Ouvrage;
  /** null si aucune occurrence en travaux normaux. */
  normaux: StatsPrix | null;
  /** null si aucune occurrence en TS. */
  ts: StatsPrix | null;
  /** Écart relatif médian TS / normaux, en %. null si l'un des deux manque. */
  deltaTs: number | null;
}

export interface StatsZone {
  zone: CodeZone;
  zoneLibelle: string;
  stats: StatsPrix | null;
  /** Écart à la médiane globale, en %. null si stats absentes. */
  ecartGlobal: number | null;
  /** true si n < 3 : à afficher en gris, mention « trop peu d'occurrences ». */
  insuffisant: boolean;
}

/** Ouvrages forfaitaires : suivis en % du montant de chantier. */
export interface StatsForfait {
  ouvrageId: UUID;
  estTs: boolean;
  n: number;
  montantMoyen: EuroHT;
  montantMedian: EuroHT;
  pctMoyenChantier: number;
  pctMedianChantier: number;
  chantierMin: EuroHT;
  chantierMax: EuroHT;
}

// ---------------------------------------------------------------------
// Séries
// ---------------------------------------------------------------------

export interface PointQuantite {
  documentId: UUID;
  date: ISODate;
  quantite: number;
  pu: EuroHT;
  puIndexe: EuroHT;
  estTs: boolean;
  zone: CodeZone | null;
}

/**
 * Conclusion d'effet quantité, calculée en SQL et non côté client.
 * null quand il n'y a pas au moins 4 points de part et d'autre du seuil :
 * dans ce cas la fiche n'affiche aucune phrase.
 */
export interface SeuilQuantite {
  seuil: number;
  unite: CodeUnite;
  medianeEnDessous: EuroHT;
  medianeAuDessus: EuroHT;
  nEnDessous: number;
  nAuDessus: number;
}

export interface Cooccurrence {
  ouvrage: Pick<Ouvrage, "id" | "libelleDevis" | "unite">;
  /** Part des chantiers contenant l'ouvrage de référence, 0–1. */
  taux: number;
  nEnsemble: number;
  /** Quantité médiane de l'associé rapportée à celle de la référence. */
  ratioQuantite: number | null;
}

// ---------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------

export interface LigneSource {
  id: UUID;
  documentId: UUID;
  ordre: number;
  /** VERBATIM, fautes comprises. Ne jamais corriger à l'affichage. */
  designationBrute: string;
  uniteBrute: string | null;
  unite: CodeUnite | null;
  quantite: number | null;
  pu: EuroHT | null;
  puIndexe: EuroHT | null;
  total: EuroHT | null;
  attributs: Record<string, string | number | boolean | null>;
  estForfait: boolean;
  /** true = ligne écartée manuellement des statistiques. */
  excluAgregats: boolean;
  motifExclusion: string | null;
}

export interface LigneSourceContexte extends LigneSource {
  date: ISODate;
  numeroDocument: string | null;
  client: string | null;
  chantierObjet: string | null;
  zone: CodeZone | null;
  zoneFiable: boolean;
  estTs: boolean;
  /** Lien vers la pièce d'origine (route signée), ou null si absente. */
  lienPdf: string | null;
  /** Statut du document porteur, quand la requête l'expose. */
  statutDocument?: StatutDocument;
  controleLigne?: ControleLigne;
}

export interface Client {
  id: UUID;
  nom: string;
  typeClient: string | null;
  commune: string | null;
  codePostal: string | null;
  nbDocuments: number;
  totalCumule: EuroHT;
}

export interface DocumentResume {
  id: UUID;
  numero: string | null;
  date: ISODate;
  type: TypeDocument;
  estTs: boolean;
  client: Pick<Client, "id" | "nom"> | null;
  chantierObjet: string | null;
  chantierCommune: string | null;
  zone: CodeZone | null;
  zoneFiable: boolean;
  totalHt: EuroHT | null;
  nbLignes: number;
  statut: StatutDocument;
  lienPdf: string | null;
}

export interface DocumentDetail extends DocumentResume {
  lignes: LigneSource[];
  /** Écart entre la somme des lignes et le total imprimé. 0 si cohérent. */
  ecartTotal: EuroHT | null;
}

/** Ligne de l'historique en mode plat. */
export interface LigneHistorique extends LigneSourceContexte {
  ouvrage: Pick<Ouvrage, "id" | "libelleDevis"> | null;
  lot: string | null;
  rattachementValide: boolean;
}

export interface FiltresHistorique {
  recherche?: string;
  clientId?: UUID;
  lotId?: UUID;
  ouvrageId?: UUID;
  zones?: CodeZone[];
  typeTravaux?: TypeTravaux;
  types?: TypeDocument[];
  depuis?: ISODate;
  jusquA?: ISODate;
  montantMin?: EuroHT;
  montantMax?: EuroHT;
}

// ---------------------------------------------------------------------
// Calage
// ---------------------------------------------------------------------

export interface RattachementAValider {
  id: UUID;
  ligne: LigneSourceContexte;
  ouvragePropose: Ouvrage;
  score: number | null;
  methode: MethodeRattachement;
  /** Alternatives les plus proches, pour arbitrer sans quitter l'écran. */
  candidats: Array<{ ouvrage: Ouvrage; score: number }>;
  statutDocument: StatutDocument;
  controleLigne: ControleLigne;
  /** Autres rattachements en attente sur le même ouvrage. */
  nbMemeOuvrage: number;
}

/** Filtres de l'écran de calage (dans l'URL : lot, methode, doc, q). */
export interface FiltresCalage {
  lotId?: UUID;
  /** 'auto' = validés automatiquement (valide_par auto / auto-llm). */
  methode?: "regle" | "llm" | "auto";
  statutDoc?: StatutDocument;
  recherche?: string;
}

/** Ligne de devis dans les écrans de calage (par ouvrage, sans ouvrage). */
export interface LigneCalage extends LigneSourceContexte {
  rattachementId: UUID | null;
  score: number | null;
  methode: MethodeRattachement | null;
  validePar: string | null;
  statutDocument: StatutDocument;
  controleLigne: ControleLigne;
  /** Lignes de même désignation normalisée dans la file (sans ouvrage). */
  nbIdentiques?: number;
}

/** Groupe de la vue « par ouvrage » : un ouvrage et ses lignes en attente. */
export interface GroupeCalage {
  ouvrage: Ouvrage;
  nbEnAttente: number;
  nbValidees: number;
  nbAuto: number;
  /** Quelques désignations verbatim, pour situer l'ouvrage d'un coup d'œil. */
  echantillon: string[];
  lignes: LigneCalage[];
  /** true si le groupe a plus de lignes que celles chargées. */
  lignesTronquees: boolean;
}

export interface FusionProposee {
  id: UUID;
  source: Ouvrage & { nbLignes: number };
  cible: Ouvrage & { nbLignes: number };
  score: number | null;
  methode: "trigramme" | "llm";
  avisLlm: "meme" | "distinct" | "incertain" | null;
  motif: string | null;
}

export interface DocumentARevoir {
  id: UUID;
  numero: string | null;
  fichierNom: string;
  date: ISODate | null;
  client: string | null;
  chantierObjet: string | null;
  estTs: boolean;
  statut: StatutDocument;
  totalHt: EuroHT | null;
  ecartTotal: EuroHT | null;
  controleTotal: "ok" | "ecart" | "non_verifiable" | "non_verifie";
  nbLignes: number;
  nbLignesEcart: number;
  lienPdf: string | null;
  /** Lignes dont le contrôle quantité × PU ≠ total a échoué. */
  lignesEnEcart: Array<{
    id: UUID;
    designation: string;
    quantite: number | null;
    pu: number | null;
    total: number | null;
    ecart: number | null;
  }>;
}

export interface ProgressionCalage {
  lignesTotal: number;
  lignesValidees: number;
  documentsARevoir: number;
  ouvragesSansValidation: number;
  rattachementsEnAttente: number;
  lignesSansOuvrage: number;
  doublonsProposes: number;
  valideesAuto: number;
}

/** Vue d'ensemble de la base : rangée de KPI et bandeau d'en-tête. */
export interface SyntheseBase {
  nbOuvrages: number;
  /** Ouvrages actifs ayant au moins une ligne comptée dans les prix. */
  nbOuvragesAvecPrix: number;
  nbLots: number;
  nbZones: number;
  nbDocuments: number;
  nbLignes: number;
  nbClients: number;
  premiereDate: string | null;
  derniereDate: string | null;
  /** date d'insertion du dernier document (timestamptz) */
  derniereEcriture: string | null;
}

// ---------------------------------------------------------------------
// Composants
// ---------------------------------------------------------------------

export interface ReglettePrixProps {
  stats: StatsPrix;
  indexe: boolean;
  /**
   * Bornes imposées de l'échelle. Sur le tableau, laisser undefined :
   * chaque réglette est autonome. Sur la fiche, passer les mêmes bornes
   * aux réglettes normaux et TS pour qu'elles soient comparables.
   */
  echelle?: { min: EuroHT; max: EuroHT };
  largeur?: number;                  // 88 dans le tableau, 280 dans la fiche
  variante?: "compacte" | "detaillee";
  /** Applique la teinte TS (--ts) au lieu de --encre. */
  ts?: boolean;
}

// ---------------------------------------------------------------------
// Signatures de la couche de requêtes
//
// Implémentation dans lib/queries/. Server-only. Ces signatures sont
// exactement celles que consomment les outils du chat : un seul chemin
// vers la donnée, donc un seul endroit où une erreur peut se glisser.
// ---------------------------------------------------------------------

export interface RequetesOuvrages {
  listerOuvrages(
    filtres: FiltresPrix,
    tri: Tri<ColonneTriPrix>,
    page: number,
    parPage?: number,
  ): Promise<Page<OuvrageResume>>;

  obtenirOuvrage(id: UUID): Promise<Ouvrage | null>;

  /** niveau 'type' si `typeTravaux` vaut normaux/ts, 'global' sinon. */
  statsOuvrage(id: UUID, filtres?: FiltresPrix): Promise<StatsPrix | null>;

  /** Les 4 zones systématiquement, y compris celles sans occurrence. */
  statsParZone(id: UUID, filtres?: FiltresPrix): Promise<StatsZone[]>;

  statsForfait(id: UUID): Promise<StatsForfait[]>;

  serieTemporelle(id: UUID, filtres?: FiltresPrix): Promise<PointQuantite[]>;

  effetQuantite(
    id: UUID,
    filtres?: FiltresPrix,
  ): Promise<{ points: PointQuantite[]; seuil: SeuilQuantite | null }>;

  cooccurrences(id: UUID, limite?: number): Promise<Cooccurrence[]>;

  lignesSources(
    id: UUID,
    filtres?: FiltresPrix,
    page?: number,
  ): Promise<Page<LigneSourceContexte>>;

  /** Écrit exclu_agregats puis appelle rafraichir_agregats(). */
  exclureLigne(ligneId: UUID, motif: string): Promise<void>;
  reintegrerLigne(ligneId: UUID): Promise<void>;
}

export interface RequetesHistorique {
  listerDocuments(f: FiltresHistorique, page: number): Promise<Page<DocumentResume>>;
  obtenirDocument(id: UUID): Promise<DocumentDetail | null>;
  listerLignes(f: FiltresHistorique, page: number): Promise<Page<LigneHistorique>>;
  chercherClient(requete: string, limite?: number): Promise<Client[]>;
}

export interface RequetesReferentiel {
  arbreLots(): Promise<LotNoeud[]>;
  chercherOuvrages(requete: string, limite?: number): Promise<Ouvrage[]>;
  rattachementsAValider(page: number, filtres?: FiltresCalage): Promise<Page<RattachementAValider>>;
  validerRattachement(id: UUID, ouvrageId?: UUID): Promise<void>;
  creerOuvrageDepuisLigne(ligneId: UUID, ouvrage: Partial<Ouvrage>): Promise<Ouvrage>;
  modifierOuvrage(id: UUID, champs: Partial<Ouvrage>): Promise<Ouvrage>;
  fusionnerOuvrages(sourceId: UUID, cibleId: UUID): Promise<void>;
  progression(): Promise<ProgressionCalage>;
}

// ---------------------------------------------------------------------
// Formatage — une seule implémentation, importée partout
// ---------------------------------------------------------------------

export const euro = (v: EuroHT | null): string =>
  v == null
    ? "—"
    : new Intl.NumberFormat("fr-FR", {
        style: "currency", currency: "EUR",
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(v);

export const nombre = (v: number | null, dec = 2): string =>
  v == null
    ? "—"
    : new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: dec, maximumFractionDigits: dec,
      }).format(v);

export const pourcent = (v: number | null, dec = 0): string =>
  v == null ? "—" : `${nombre(v * 100, dec)} %`;

export const date = (d: ISODate | null): string =>
  d == null ? "—" : new Intl.DateTimeFormat("fr-FR").format(new Date(d));

export const LIBELLES_UNITES: Record<CodeUnite, string> = {
  m2: "m²", ml: "ml", m3: "m³", u: "u", kg: "kg",
  h: "h", j: "j", ens: "ens", forfait: "forfait",
};

export const LIBELLES_ZONES: Record<CodeZone, string> = {
  "06": "Alpes-Maritimes",
  MERCANTOUR: "Mercantour",
  TOULON: "Toulon et alentours",
  "83_AUTRE": "Reste du Var",
};

export const LIBELLES_FIABILITE: Record<Fiabilite, string> = {
  haute: "Fiable", moyenne: "À confirmer", faible: "Peu de données",
};
