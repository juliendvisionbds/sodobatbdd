// =====================================================================
// SODOBAT — 07_seed_referentiel.ts
//
// Données de démonstration FIGÉES. Ne demande pas au modèle d'inventer
// des ouvrages ou des prix : les valeurs ci-dessous sont plausibles pour
// une entreprise de gros œuvre du Var en 2026 et rendent le jeu de démo
// montrable au client avant même le premier import réel.
//
// `scripts/seed.ts` consomme ce fichier et génère documents et lignes
// selon les règles de la section GÉNÉRATION, en bas.
// =====================================================================

import type { CodeUnite, CodeZone } from "../lib/types";

// ---------------------------------------------------------------------
// Lots
// ---------------------------------------------------------------------

export const LOTS = [
  { code: "GO",    libelle: "Gros œuvre",            parent: null, ordre: 1 },
  { code: "GO.BA", libelle: "Béton armé",            parent: "GO", ordre: 1 },
  { code: "GO.MA", libelle: "Maçonnerie",            parent: "GO", ordre: 2 },
  { code: "CM",    libelle: "Charpente métallique",  parent: null, ordre: 2 },
  { code: "ET",    libelle: "Étanchéité",            parent: null, ordre: 3 },
  { code: "RA",    libelle: "Ravalement et façade",  parent: null, ordre: 4 },
  { code: "DE",    libelle: "Démolition",            parent: null, ordre: 5 },
  { code: "FC",    libelle: "Frais de chantier",     parent: null, ordre: 6 },
] as const;

// ---------------------------------------------------------------------
// Ouvrages
//
// pu       : prix unitaire HT médian, référence janvier 2026
// cv       : coefficient de variation cible (dispersion réaliste)
// n        : occurrences en travaux normaux
// nTs      : occurrences en travaux supplémentaires (0 = aucune)
// majTs    : majoration TS appliquée au prix normal
// brutes   : désignations telles qu'imprimées sur les documents, fautes
//            comprises. Quand la liste est absente, le générateur produit
//            des variantes légères de `libelleDevis`.
// ---------------------------------------------------------------------

export interface OuvrageSeed {
  code: string;
  lot: string;
  libelleDevis: string;
  libelleNormalise: string;
  unite: CodeUnite;
  pu: number;
  cv: number;
  n: number;
  nTs: number;
  majTs: number;
  brutes?: string[];
  forfaitaire?: boolean;
  /** Forfaits uniquement : part médiane du montant de chantier, en %. */
  pctChantier?: number;
}

export const OUVRAGES: OuvrageSeed[] = [
  // ---- Gros œuvre / béton armé ----
  { code: "GO-SEM-FIL", lot: "GO.BA", unite: "m3", pu: 420, cv: 0.18, n: 9, nTs: 2, majTs: 0.22,
    libelleDevis: "Semelle filante en béton armé",
    libelleNormalise: "semelle filante beton arme" },
  { code: "GO-POT-BA", lot: "GO.BA", unite: "m3", pu: 780, cv: 0.22, n: 7, nTs: 0, majTs: 0,
    libelleDevis: "Poteau en béton armé coffré",
    libelleNormalise: "poteau beton arme coffre" },
  { code: "GO-POU-BA", lot: "GO.BA", unite: "m3", pu: 850, cv: 0.20, n: 6, nTs: 2, majTs: 0.25,
    libelleDevis: "Poutre en béton armé",
    libelleNormalise: "poutre beton arme" },
  { code: "GO-DAL-20", lot: "GO.BA", unite: "m2", pu: 165, cv: 0.16, n: 14, nTs: 3, majTs: 0.20,
    libelleDevis: "Dalle en béton armé épaisseur 20 cm",
    libelleNormalise: "dalle beton arme ep 20",
    brutes: ["Dalle BA ep 20cm", "Dalle en béton armé ép. 20 cm", "Réalisation dalle BA 20 cm"] },
  { code: "GO-CHA-RAG", lot: "GO.BA", unite: "m2", pu: 28, cv: 0.24, n: 11, nTs: 0, majTs: 0,
    libelleDevis: "Chape de ragréage",
    libelleNormalise: "chape ragreage" },
  { code: "GO-SSO", lot: "GO.BA", unite: "ml", pu: 620, cv: 0.34, n: 4, nTs: 2, majTs: 0.35,
    libelleDevis: "Reprise en sous-œuvre",
    libelleNormalise: "reprise sous oeuvre" },
  { code: "GO-SCE-CHI", lot: "GO.BA", unite: "u", pu: 22, cv: 0.28, n: 8, nTs: 0, majTs: 0,
    libelleDevis: "Scellement chimique de tige filetée",
    libelleNormalise: "scellement chimique tige filetee" },
  { code: "GO-CAR-100", lot: "GO.BA", unite: "u", pu: 95, cv: 0.21, n: 6, nTs: 0, majTs: 0,
    libelleDevis: "Carottage de béton diamètre 100",
    libelleNormalise: "carottage beton d100" },
  { code: "GO-PAS-POU", lot: "GO.BA", unite: "u", pu: 34, cv: 0.19, n: 6, nTs: 2, majTs: 0.30,
    libelleDevis: "Passivation de poutrelle",
    libelleNormalise: "passivation poutrelle",
    brutes: ["Pacivation des poutrelles", "Passivation des poutrelles",
             "Pacivation poutrelles beton", "Passivation d'armatures poutrelles"] },
  { code: "GO-END-POU", lot: "GO.BA", unite: "u", pu: 48, cv: 0.17, n: 6, nTs: 2, majTs: 0.28,
    libelleDevis: "Enduit de poutrelle en mortier de réparation",
    libelleNormalise: "enduit poutrelle mortier reparation",
    brutes: ["Enduit des poutrelles", "Enduit de poutrelles mortier"] },
  { code: "GO-ARM-REP", lot: "GO.BA", unite: "ml", pu: 78, cv: 0.30, n: 3, nTs: 0, majTs: 0,
    libelleDevis: "Remplacement d'armature corrodée",
    libelleNormalise: "remplacement armature corrodee" },
  { code: "GO-MUR-SOU", lot: "GO.BA", unite: "m3", pu: 690, cv: 0.15, n: 2, nTs: 0, majTs: 0,
    libelleDevis: "Mur de soutènement en béton",
    libelleNormalise: "mur soutenement beton" },
  { code: "GO-DAL-PORT", lot: "GO.BA", unite: "m2", pu: 210, cv: 0, n: 1, nTs: 0, majTs: 0,
    libelleDevis: "Dalle portée sur bac acier",
    libelleNormalise: "dalle portee bac acier" },
  { code: "GO-INJ-RES", lot: "GO.BA", unite: "ml", pu: 145, cv: 0, n: 1, nTs: 0, majTs: 0,
    libelleDevis: "Injection de résine époxy en fissure",
    libelleNormalise: "injection resine epoxy fissure" },

  // ---- Gros œuvre / maçonnerie ----
  { code: "GO-AGG-20", lot: "GO.MA", unite: "m2", pu: 78, cv: 0.15, n: 13, nTs: 2, majTs: 0.18,
    libelleDevis: "Mur en agglomérés de 20",
    libelleNormalise: "mur agglomere 20",
    brutes: ["Mur en agglos de 20", "Maçonnerie agglos 20", "Mur agglo 20 monté au mortier"] },
  { code: "GO-CLO-BRI", lot: "GO.MA", unite: "m2", pu: 52, cv: 0.18, n: 8, nTs: 0, majTs: 0,
    libelleDevis: "Cloison en brique plâtrière",
    libelleNormalise: "cloison brique platriere" },
  { code: "GO-LIN-PRE", lot: "GO.MA", unite: "ml", pu: 68, cv: 0.20, n: 7, nTs: 0, majTs: 0,
    libelleDevis: "Linteau préfabriqué",
    libelleNormalise: "linteau prefabrique" },
  { code: "GO-OUV-POR", lot: "GO.MA", unite: "u", pu: 1250, cv: 0.38, n: 5, nTs: 3, majTs: 0.32,
    libelleDevis: "Création d'ouverture dans mur porteur",
    libelleNormalise: "ouverture mur porteur",
    brutes: ["Ouverture dans mur porteur avec pose IPN",
             "Création ouverture mur porteur", "Percement mur porteur + linteau"] },
  { code: "GO-TRE-REB", lot: "GO.MA", unite: "u", pu: 320, cv: 0.26, n: 4, nTs: 0, majTs: 0,
    libelleDevis: "Rebouchage de trémie",
    libelleNormalise: "rebouchage tremie" },
  { code: "GO-END-CIM", lot: "GO.MA", unite: "m2", pu: 38, cv: 0.19, n: 9, nTs: 0, majTs: 0,
    libelleDevis: "Enduit ciment de dressage",
    libelleNormalise: "enduit ciment dressage" },

  // ---- Charpente métallique ----
  { code: "CM-IPN-160", lot: "CM", unite: "u", pu: 147, cv: 0.18, n: 12, nTs: 4, majTs: 0.29,
    libelleDevis: "Fourniture et pose d'IPN 160 porté de mur en mur",
    libelleNormalise: "ipn 160 porte mur a mur",
    brutes: ["Fourniture et pose d'IPN 160 porté de mur en mur 2M50 Environ",
             "F. et pose IPN 160 porté de mur en mur",
             "Fourniture et pose d'IPN160 porte de mur en mur 3M",
             "Pose IPN 160 mur a mur avec scellement"] },
  { code: "CM-IPN-200", lot: "CM", unite: "u", pu: 189, cv: 0.17, n: 7, nTs: 2, majTs: 0.26,
    libelleDevis: "Fourniture et pose d'IPN 200 porté de mur en mur",
    libelleNormalise: "ipn 200 porte mur a mur" },
  { code: "CM-IPE-140", lot: "CM", unite: "u", pu: 118, cv: 0.20, n: 5, nTs: 0, majTs: 0,
    libelleDevis: "Fourniture et pose d'IPE 140",
    libelleNormalise: "ipe 140" },
  { code: "CM-SAB-MET", lot: "CM", unite: "u", pu: 51, cv: 0.16, n: 9, nTs: 3, majTs: 0.24,
    libelleDevis: "Fourniture et pose de sabot métallique chevillé",
    libelleNormalise: "sabot metallique cheville",
    brutes: ["Fourniture et pose de sabot metalique chevillé dans les murs bétons",
             "F. et pose sabots métalliques chevillés",
             "Sabot metalique chevillé mur beton"] },
  { code: "CM-PLA-ABO", lot: "CM", unite: "u", pu: 78, cv: 0.22, n: 6, nTs: 0, majTs: 0,
    libelleDevis: "Platine d'about soudée",
    libelleNormalise: "platine about soudee" },
  { code: "CM-PEI-ANT", lot: "CM", unite: "ml", pu: 14, cv: 0.25, n: 7, nTs: 0, majTs: 0,
    libelleDevis: "Peinture antirouille sur profilé",
    libelleNormalise: "peinture antirouille profile" },
  { code: "CM-ETA-TUB", lot: "CM", unite: "u", pu: 38, cv: 0.21, n: 8, nTs: 2, majTs: 0.20,
    libelleDevis: "Étaiement provisoire par étai tubulaire",
    libelleNormalise: "etaiement provisoire etai tubulaire" },
  { code: "CM-POU-REN", lot: "CM", unite: "ml", pu: 96, cv: 0.19, n: 5, nTs: 0, majTs: 0,
    libelleDevis: "Poutrelle métallique de renfort",
    libelleNormalise: "poutrelle metallique renfort" },
  { code: "CM-GAR-COR", lot: "CM", unite: "ml", pu: 245, cv: 0.23, n: 4, nTs: 0, majTs: 0,
    libelleDevis: "Garde-corps métallique",
    libelleNormalise: "garde corps metallique" },
  { code: "CM-POT-TUB", lot: "CM", unite: "u", pu: 420, cv: 0.10, n: 2, nTs: 0, majTs: 0,
    libelleDevis: "Poteau tubulaire métallique",
    libelleNormalise: "poteau tubulaire metallique" },
  { code: "CM-ESC-MET", lot: "CM", unite: "u", pu: 3800, cv: 0, n: 1, nTs: 0, majTs: 0,
    libelleDevis: "Escalier métallique droit",
    libelleNormalise: "escalier metallique droit" },

  // ---- Étanchéité ----
  { code: "ET-BIC-AUT", lot: "ET", unite: "m2", pu: 78, cv: 0.14, n: 21, nTs: 3, majTs: 0.18,
    libelleDevis: "Étanchéité bicouche autoprotégée",
    libelleNormalise: "etancheite bicouche autoprotegee",
    brutes: ["Etanchéité bicouche autoprotégée", "Etancheite bi-couche autoprotegee",
             "Fourniture et pose étanchéité bicouche"] },
  { code: "ET-SEL", lot: "ET", unite: "m2", pu: 62, cv: 0.17, n: 12, nTs: 0, majTs: 0,
    libelleDevis: "Étanchéité liquide type SEL",
    libelleNormalise: "etancheite liquide sel" },
  { code: "ET-REL", lot: "ET", unite: "ml", pu: 54, cv: 0.19, n: 15, nTs: 2, majTs: 0.22,
    libelleDevis: "Relevé d'étanchéité",
    libelleNormalise: "releve etancheite" },
  { code: "ET-ISO-PU80", lot: "ET", unite: "m2", pu: 42, cv: 0.13, n: 11, nTs: 0, majTs: 0,
    libelleDevis: "Isolation thermique polyuréthane 80 mm",
    libelleNormalise: "isolation polyurethane 80" },
  { code: "ET-FOR-PEN", lot: "ET", unite: "m2", pu: 48, cv: 0.21, n: 9, nTs: 0, majTs: 0,
    libelleDevis: "Forme de pente en béton allégé",
    libelleNormalise: "forme de pente beton allege" },
  { code: "ET-EP-100", lot: "ET", unite: "ml", pu: 88, cv: 0.18, n: 8, nTs: 0, majTs: 0,
    libelleDevis: "Fourniture et pose d'EP fonte diamètre 100",
    libelleNormalise: "eaux pluviales fonte d100" },
  { code: "ET-NAI-EP", lot: "ET", unite: "u", pu: 145, cv: 0.22, n: 7, nTs: 0, majTs: 0,
    libelleDevis: "Naissance d'évacuation d'eau pluviale",
    libelleNormalise: "naissance evacuation eau pluviale" },
  { code: "ET-COS-MET", lot: "ET", unite: "ml", pu: 72, cv: 0.20, n: 5, nTs: 0, majTs: 0,
    libelleDevis: "Costière métallique",
    libelleNormalise: "costiere metallique" },
  { code: "ET-VEL-TOI", lot: "ET", unite: "u", pu: 980, cv: 0.08, n: 2, nTs: 0, majTs: 0,
    libelleDevis: "Fourniture et pose de fenêtre de toit",
    libelleNormalise: "fenetre de toit" },
  { code: "ET-PUI-PER", lot: "ET", unite: "u", pu: 2400, cv: 0, n: 1, nTs: 0, majTs: 0,
    libelleDevis: "Création de puits perdu",
    libelleNormalise: "puits perdu" },

  // ---- Ravalement ----
  { code: "RA-ECH-PIE", lot: "RA", unite: "m2", pu: 18, cv: 0.26, n: 18, nTs: 2, majTs: 0.15,
    libelleDevis: "Échafaudage de pied",
    libelleNormalise: "echafaudage de pied",
    brutes: ["Echafaudage de pied", "Montage et démontage échafaudage de pied",
             "Echaffaudage de pied"] },
  { code: "RA-PIQ-END", lot: "RA", unite: "m2", pu: 24, cv: 0.29, n: 14, nTs: 3, majTs: 0.25,
    libelleDevis: "Piquage d'enduit dégradé",
    libelleNormalise: "piquage enduit degrade" },
  { code: "RA-END-MON", lot: "RA", unite: "m2", pu: 46, cv: 0.16, n: 16, nTs: 2, majTs: 0.19,
    libelleDevis: "Enduit monocouche gratté",
    libelleNormalise: "enduit monocouche gratte" },
  { code: "RA-PEI-D3", lot: "RA", unite: "m2", pu: 28, cv: 0.18, n: 13, nTs: 0, majTs: 0,
    libelleDevis: "Peinture de façade classe D3",
    libelleNormalise: "peinture facade d3" },
  { code: "RA-JOI-DIL", lot: "RA", unite: "ml", pu: 38, cv: 0.24, n: 6, nTs: 0, majTs: 0,
    libelleDevis: "Réfection de joint de dilatation",
    libelleNormalise: "refection joint dilatation" },
  { code: "RA-VEN-FAC", lot: "RA", unite: "u", pu: 189, cv: 0.21, n: 5, nTs: 2, majTs: 0.27,
    libelleDevis: "Création de ventilation naturelle en façade",
    libelleNormalise: "ventilation naturelle facade",
    brutes: ["Création de ventillation en façade pour ventillation naturel",
             "Creation ventilation facade naturelle",
             "Création de ventillation façade"] },
  { code: "RA-FIS-PON", lot: "RA", unite: "ml", pu: 32, cv: 0.27, n: 9, nTs: 0, majTs: 0,
    libelleDevis: "Traitement de fissure par pontage",
    libelleNormalise: "traitement fissure pontage" },
  { code: "RA-NET-HP", lot: "RA", unite: "m2", pu: 8.5, cv: 0.22, n: 12, nTs: 0, majTs: 0,
    libelleDevis: "Nettoyage haute pression de façade",
    libelleNormalise: "nettoyage haute pression facade" },
  { code: "RA-BAL-REP", lot: "RA", unite: "ml", pu: 210, cv: 0.12, n: 2, nTs: 0, majTs: 0,
    libelleDevis: "Reprise de nez de balcon",
    libelleNormalise: "reprise nez de balcon" },
  { code: "RA-COR-MOU", lot: "RA", unite: "ml", pu: 320, cv: 0, n: 1, nTs: 0, majTs: 0,
    libelleDevis: "Réfection de corniche moulurée",
    libelleNormalise: "refection corniche mouluree" },

  // ---- Démolition ----
  { code: "DE-DAL-BET", lot: "DE", unite: "m2", pu: 58, cv: 0.25, n: 8, nTs: 2, majTs: 0.22,
    libelleDevis: "Démolition de dalle béton",
    libelleNormalise: "demolition dalle beton" },
  { code: "DE-CLO", lot: "DE", unite: "m2", pu: 26, cv: 0.28, n: 7, nTs: 0, majTs: 0,
    libelleDevis: "Démolition de cloison",
    libelleNormalise: "demolition cloison" },
  { code: "DE-GRA-BEN", lot: "DE", unite: "m3", pu: 68, cv: 0.20, n: 16, nTs: 0, majTs: 0,
    libelleDevis: "Évacuation de gravats en benne",
    libelleNormalise: "evacuation gravats benne",
    brutes: ["Evacuation des gravats en benne", "Evacuation gravas en benne",
             "Location benne et évacuation gravats"] },
  { code: "DE-SCI-BA", lot: "DE", unite: "ml", pu: 82, cv: 0.24, n: 6, nTs: 0, majTs: 0,
    libelleDevis: "Sciage de béton armé",
    libelleNormalise: "sciage beton arme" },
  { code: "DE-DES-AMI", lot: "DE", unite: "m2", pu: 185, cv: 0, n: 1, nTs: 0, majTs: 0,
    libelleDevis: "Dépose d'élément amianté",
    libelleNormalise: "depose element amiante" },

  // ---- Frais de chantier (forfaitaires) ----
  { code: "FC-ETU-BET", lot: "FC", unite: "forfait", pu: 0, cv: 0.30, n: 12, nTs: 0, majTs: 0,
    forfaitaire: true, pctChantier: 4.4,
    libelleDevis: "Étude béton et note de calcul",
    libelleNormalise: "etude beton note de calcul",
    brutes: ["Etude béton", "Etude beton et note de calcul", "Note de calcul BA"] },
  { code: "FC-AME-REP", lot: "FC", unite: "forfait", pu: 0, cv: 0.35, n: 24, nTs: 4, majTs: 0.10,
    forfaitaire: true, pctChantier: 5.0,
    libelleDevis: "Amenée et repli du matériel",
    libelleNormalise: "amenee repli materiel",
    brutes: ["Amenée/repli du materiel", "Amenee et repli de matériel",
             "Amenée / repli du matériel de chantier"] },
  { code: "FC-DEC-ETA", lot: "FC", unite: "forfait", pu: 0, cv: 0.28, n: 6, nTs: 0, majTs: 0,
    forfaitaire: true, pctChantier: 5.8,
    libelleDevis: "Décoffrage d'étaiements provisoires",
    libelleNormalise: "decoffrage etaiements provisoires",
    brutes: ["Decoffrage des etaiements provisoir ( stockage sur place de parking)",
             "Décoffrage des étaiements provisoires"] },
  { code: "FC-INS-CHA", lot: "FC", unite: "forfait", pu: 0, cv: 0.32, n: 18, nTs: 0, majTs: 0,
    forfaitaire: true, pctChantier: 3.2,
    libelleDevis: "Installation de chantier",
    libelleNormalise: "installation de chantier" },
  { code: "FC-NET-FIN", lot: "FC", unite: "forfait", pu: 0, cv: 0.26, n: 21, nTs: 0, majTs: 0,
    forfaitaire: true, pctChantier: 1.5,
    libelleDevis: "Nettoyage de fin de chantier",
    libelleNormalise: "nettoyage fin de chantier" },
];

// ---------------------------------------------------------------------
// Zones et communes — DÉCISION FIGÉE
//
// « Mercantour » n'est pas un découpage administratif : c'est la vallée,
// où les coûts d'accès et de portage majorent les prix. Ce découpage est
// à faire confirmer commune par commune par Sodobat, mais il tient pour
// la démonstration.
// ---------------------------------------------------------------------

export const ZONES: Array<{ code: CodeZone; libelle: string; ordre: number }> = [
  { code: "06",          libelle: "Alpes-Maritimes",       ordre: 1 },
  { code: "MERCANTOUR",  libelle: "Mercantour",            ordre: 2 },
  { code: "TOULON",      libelle: "Toulon et alentours",   ordre: 3 },
  { code: "83_AUTRE",    libelle: "Reste du Var",          ordre: 4 },
];

export const COMMUNES: Array<[string, string, CodeZone]> = [
  // Alpes-Maritimes littoral et moyen pays
  ["06000", "Nice", "06"], ["06100", "Nice", "06"], ["06200", "Nice", "06"],
  ["06300", "Nice", "06"], ["06400", "Cannes", "06"], ["06600", "Antibes", "06"],
  ["06130", "Grasse", "06"], ["06800", "Cagnes-sur-Mer", "06"],
  ["06500", "Menton", "06"], ["06220", "Vallauris", "06"],
  ["06210", "Mandelieu-la-Napoule", "06"], ["06110", "Le Cannet", "06"],
  ["06250", "Mougins", "06"], ["06700", "Saint-Laurent-du-Var", "06"],
  ["06140", "Vence", "06"], ["06270", "Villeneuve-Loubet", "06"],
  ["06160", "Antibes Juan-les-Pins", "06"],

  // Mercantour — haute vallée, accès difficile
  ["06450", "Saint-Martin-Vésubie", "MERCANTOUR"],
  ["06450", "Roquebillière", "MERCANTOUR"],
  ["06450", "Belvédère", "MERCANTOUR"],
  ["06420", "Isola", "MERCANTOUR"],
  ["06420", "Valdeblore", "MERCANTOUR"],
  ["06660", "Saint-Étienne-de-Tinée", "MERCANTOUR"],
  ["06470", "Guillaumes", "MERCANTOUR"],
  ["06470", "Beuil", "MERCANTOUR"],
  ["06470", "Péone", "MERCANTOUR"],
  ["06430", "Tende", "MERCANTOUR"],

  // Aire toulonnaise
  ["83000", "Toulon", "TOULON"], ["83100", "Toulon", "TOULON"],
  ["83200", "Toulon", "TOULON"], ["83500", "La Seyne-sur-Mer", "TOULON"],
  ["83130", "La Garde", "TOULON"], ["83160", "La Valette-du-Var", "TOULON"],
  ["83140", "Six-Fours-les-Plages", "TOULON"], ["83190", "Ollioules", "TOULON"],
  ["83220", "Le Pradet", "TOULON"], ["83400", "Hyères", "TOULON"],
  ["83110", "Sanary-sur-Mer", "TOULON"],

  // Reste du Var
  ["83600", "Fréjus", "83_AUTRE"], ["83700", "Saint-Raphaël", "83_AUTRE"],
  ["83300", "Draguignan", "83_AUTRE"], ["83170", "Brignoles", "83_AUTRE"],
  ["83340", "Le Luc", "83_AUTRE"], ["83120", "Sainte-Maxime", "83_AUTRE"],
  ["83990", "Saint-Tropez", "83_AUTRE"],
  ["83520", "Roquebrune-sur-Argens", "83_AUTRE"],
  ["83480", "Puget-sur-Argens", "83_AUTRE"], ["83550", "Vidauban", "83_AUTRE"],
];

/**
 * Majoration de prix par zone appliquée à la génération. Le Mercantour
 * est plus cher (accès, portage, déplacements), Toulon légèrement moins
 * cher (concurrence plus forte). Sert uniquement au seed : l'application
 * lit les prix réels, elle n'applique aucun coefficient.
 */
export const COEF_ZONE: Record<CodeZone, number> = {
  "06": 1.03, MERCANTOUR: 1.21, TOULON: 0.96, "83_AUTRE": 1.0,
};

// ---------------------------------------------------------------------
// Unités
// ---------------------------------------------------------------------

export const UNITES: Array<[CodeUnite, string, boolean, boolean]> = [
  // code, libellé, est_forfaitaire, agrégable
  ["m2", "mètre carré", false, true],
  ["ml", "mètre linéaire", false, true],
  ["m3", "mètre cube", false, true],
  ["u", "unité", false, true],
  ["kg", "kilogramme", false, true],
  ["h", "heure", false, true],
  ["j", "jour", false, true],
  ["ens", "ensemble", true, false],
  ["forfait", "forfait", true, false],
];

export const UNITES_ALIAS: Array<[string, CodeUnite, number]> = [
  ["m2", "m2", 1], ["M2", "m2", 1], ["m²", "m2", 1], ["M²", "m2", 1],
  ["mètre carré", "m2", 1], ["cm2", "m2", 0.0001],
  ["ml", "ml", 1], ["ML", "ml", 1], ["Ml", "ml", 1], ["mètre linéaire", "ml", 1],
  ["m", "ml", 1], ["M", "ml", 1],
  ["m3", "m3", 1], ["M3", "m3", 1], ["m³", "m3", 1],
  ["u", "u", 1], ["U", "u", 1], ["un", "u", 1], ["unité", "u", 1],
  ["Unité", "u", 1], ["pce", "u", 1], ["p", "u", 1],
  ["kg", "kg", 1], ["Kg", "kg", 1], ["KG", "kg", 1], ["t", "kg", 1000],
  ["h", "h", 1], ["H", "h", 1], ["hr", "h", 1],
  ["j", "j", 1], ["J", "j", 1], ["jour", "j", 1],
  ["ens", "ens", 1], ["Ens", "ens", 1], ["ENS", "ens", 1], ["ens.", "ens", 1],
  ["ensemble", "ens", 1],
  ["fft", "forfait", 1], ["Fft", "forfait", 1], ["ft", "forfait", 1],
  ["forfait", "forfait", 1], ["Forfait", "forfait", 1], ["FORFAIT", "forfait", 1],
];

// ---------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------

export const CLIENTS: Array<{
  nom: string; type: string; cp: string; commune: string;
  /** true quand l'adresse de facturation vaut adresse de chantier. */
  adresseVautChantier: boolean;
}> = [
  { nom: "Copropriété de la Croix du Sud", type: "copropriete", cp: "83600", commune: "Fréjus", adresseVautChantier: true },
  { nom: "Copropriété Les Terrasses du Port", type: "copropriete", cp: "83500", commune: "La Seyne-sur-Mer", adresseVautChantier: true },
  { nom: "Copropriété Le Belvédère", type: "copropriete", cp: "06400", commune: "Cannes", adresseVautChantier: true },
  { nom: "Copropriété Les Jardins d'Azur", type: "copropriete", cp: "06800", commune: "Cagnes-sur-Mer", adresseVautChantier: true },
  { nom: "Cabinet Marceau Syndic", type: "syndic", cp: "06000", commune: "Nice", adresseVautChantier: false },
  { nom: "Foncia Var Est", type: "syndic", cp: "83700", commune: "Saint-Raphaël", adresseVautChantier: false },
  { nom: "Citya Méditerranée", type: "syndic", cp: "83000", commune: "Toulon", adresseVautChantier: false },
  { nom: "SCI Les Oliviers", type: "entreprise", cp: "83600", commune: "Fréjus", adresseVautChantier: false },
  { nom: "SCI Bellevue Investissement", type: "entreprise", cp: "06600", commune: "Antibes", adresseVautChantier: false },
  { nom: "Var Habitat", type: "bailleur", cp: "83300", commune: "Draguignan", adresseVautChantier: false },
  { nom: "Côte d'Azur Habitat", type: "bailleur", cp: "06200", commune: "Nice", adresseVautChantier: false },
  { nom: "Mairie de Vence", type: "collectivite", cp: "06140", commune: "Vence", adresseVautChantier: false },
  { nom: "Commune de Saint-Martin-Vésubie", type: "collectivite", cp: "06450", commune: "Saint-Martin-Vésubie", adresseVautChantier: true },
  { nom: "Promogim Provence", type: "promoteur", cp: "06210", commune: "Mandelieu-la-Napoule", adresseVautChantier: false },
  { nom: "M. et Mme Ferrand", type: "particulier", cp: "83520", commune: "Roquebrune-sur-Argens", adresseVautChantier: true },
  { nom: "Résidence Le Mercantour", type: "copropriete", cp: "06420", commune: "Isola", adresseVautChantier: true },
];

// ---------------------------------------------------------------------
// Index de prix — inflation ~4 % / an, base 100 en janvier 2024
// ---------------------------------------------------------------------

export function genererIndexPrix(): Array<{ mois: string; coefficient: number }> {
  const out = [];
  const mensuel = Math.pow(1.04, 1 / 12);
  for (let i = 0; i < 36; i++) {
    const d = new Date(Date.UTC(2024, i, 1));
    out.push({
      mois: d.toISOString().slice(0, 10),
      coefficient: +(100 * Math.pow(mensuel, i)).toFixed(4),
    });
  }
  return out;
}

// =====================================================================
// GÉNÉRATION — règles impératives pour scripts/seed.ts
// =====================================================================
//
// DÉTERMINISME
//   Générateur pseudo-aléatoire à graine fixe (mulberry32, graine 20260410).
//   Deux exécutions du seed produisent la base identique, sinon aucune
//   capture d'écran ni test ne tient d'un jour à l'autre.
//
// DOCUMENTS
//   32 documents entre le 15/01/2024 et le 30/06/2026, dont :
//     - 7 marqués est_ts = true
//     - 4 en type_document 'facture', le reste en 'devis'
//     - répartition sur les 4 zones, avec au moins 5 en Mercantour
//     - 8 avec zone_fiable = false (clients dont adresseVautChantier
//       est false : la zone est déduite de l'adresse de facturation)
//     - 2 en statut 'a_revoir' avec un écart arithmétique volontaire,
//       pour alimenter l'onglet correspondant de /calage
//   Chaque document porte 6 à 14 lignes, cohérentes entre elles : ne
//   mélange pas de l'étanchéité et de la démolition d'amiante sur le
//   même chantier. Tire un « thème » par document (terrasse, façade,
//   ouverture, toiture, structure) et pioche dans les lots concernés.
//
// LE DOCUMENT TÉMOIN
//   Le devis Croix du Sud du 10/04/2026 est reproduit à l'identique :
//   numéro DEV-2026-041, 8 lignes, total HT 49 548,00 €, TVA 20 %,
//   total TTC 59 457,60 €. Désignations exactement telles qu'imprimées,
//   fautes comprises. C'est le document de référence des captures
//   d'écran et de la démonstration client.
//
// PRIX
//   pu = ouvrage.pu × coefZone × coefAnnee × (1 + bruit)
//     coefAnnee : 2024 = 0,925 · 2025 = 0,962 · 2026 = 1,0
//     bruit : loi normale tronquée d'écart-type = ouvrage.cv, bornée à ±2σ
//   Les lignes TS reçoivent en plus (1 + majTs).
//   Arrondis : au centime sous 100 €, à l'euro au-delà.
//
// FORFAITS
//   Montant = pctChantier % du total des lignes non forfaitaires du
//   document, avec un bruit de cv. Ils sont donc calculés en dernier,
//   après les autres lignes.
//
// COHÉRENCE ARITHMÉTIQUE
//   quantite × pu = total_ht au centime près sur tous les documents,
//   sauf les 2 marqués 'a_revoir'. Les tests de 09 vérifient ce point.
//
// COUPLAGE
//   Quand un document contient CM-IPN-160, il contient CM-SAB-MET dans
//   78 % des cas, avec une quantité double. Et CM-PLA-ABO dans 41 % des
//   cas, à quantité égale. Sans ce couplage, l'écran co-occurrence est
//   vide et invérifiable.
//
// EFFET QUANTITÉ
//   Sur ET-BIC-AUT, RA-END-MON et GO-DAL-20, applique une remise de
//   volume : −12 % de PU au-delà de 150 unités. Il faut au moins 4
//   points de part et d'autre du seuil pour que la fiche puisse afficher
//   sa phrase de conclusion.
//
// ABERRATIONS
//   Exactement 3 lignes à 2,5 × la médiane de leur ouvrage, sur
//   CM-IPN-160, RA-PIQ-END et DE-GRA-BEN. Elles restent incluses dans
//   les agrégats : c'est à l'utilisateur de les exclure depuis la fiche,
//   et c'est le scénario de démonstration le plus convaincant.
//
// DÉSIGNATIONS BRUTES
//   Pioche dans `brutes` quand la liste existe. Sinon, produis une
//   variante légère du libellé : suppression d'accents, abréviation de
//   « Fourniture et pose » en « F. et pose », ou minuscule initiale.
//   Ne recopie jamais `libelleDevis` tel quel dans `designation_brute` :
//   l'écart entre les deux est ce que l'écran de calage doit montrer.
//
// UNITÉS BRUTES
//   Alterne les graphies : 'u' et 'U' pour les unités, 'ens' pour les
//   forfaits, 'M2' et 'm²' pour les surfaces. La table unites_alias doit
//   être exercée par le seed, pas seulement remplie.
//
// RATTACHEMENTS
//   Tous validés (valide = true, methode = 'manuel'), sauf 60 laissés
//   en attente avec un score entre 0,42 et 0,78, pour alimenter la file
//   de /calage.
//
// FIN
//   Appelle rafraichir_agregats() puis affiche un récapitulatif :
//   nombre d'ouvrages, de documents, de lignes, et la répartition des
//   fiabilités. Si aucun ouvrage ne ressort en fiabilité 'faible', le
//   seed a échoué : lève une erreur.
