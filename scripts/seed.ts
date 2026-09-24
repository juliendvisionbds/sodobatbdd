// =====================================================================
// SODOBAT — scripts/seed.ts
// Jeu de démonstration déterministe (graine fixe 20260410).
// Consomme seed/referentiel.ts en suivant sa section GÉNÉRATION.
//
//   npm run db:seed        (ré-exécutable : vide puis régénère tout)
//
// Adaptation documentée : la somme des occurrences du référentiel
// (502 lignes normales + 49 TS) dépasse ce que 32 documents de 6 à 14
// lignes peuvent contenir. Les comptes d'occurrences par ouvrage sont
// prioritaires (ce sont eux que les tests et les écrans vérifient) :
// les documents portent donc 8 à 24 lignes.
// =====================================================================

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import postgres from "postgres";
import bcrypt from "bcryptjs";
import {
  LOTS,
  OUVRAGES,
  ZONES,
  COMMUNES,
  COEF_ZONE,
  UNITES,
  UNITES_ALIAS,
  CLIENTS,
  genererIndexPrix,
  type OuvrageSeed,
} from "../seed/referentiel";
import type { CodeUnite, CodeZone } from "../lib/types";

const sql = postgres(process.env.DATABASE_URL!, {
  max: 1,
  prepare: false,
  onnotice: () => {},
});

// ---------------------------------------------------------------------
// Générateur pseudo-aléatoire — mulberry32, graine 20260410
// ---------------------------------------------------------------------

function mulberry32(graine: number) {
  let a = graine;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const alea = mulberry32(20260410);
const entier = (min: number, max: number) =>
  min + Math.floor(alea() * (max - min + 1));
const parmi = <T>(liste: readonly T[]): T => liste[entier(0, liste.length - 1)];

/** Loi normale tronquée à ±2σ (Box-Muller). */
function bruit(sigma: number): number {
  if (sigma <= 0) return 0;
  for (;;) {
    const u1 = Math.max(alea(), 1e-9);
    const u2 = alea();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const v = z * sigma;
    if (Math.abs(v) <= 2 * sigma) return v;
  }
}

/** Arrondi des PU : au centime sous 100 €, à l'euro au-delà. */
const arrondirPu = (x: number) =>
  x < 100 ? Math.round(x * 100) / 100 : Math.round(x);

const arrondir2 = (x: number) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------------
// Constantes de génération
// ---------------------------------------------------------------------

const COEF_ANNEE: Record<number, number> = { 2024: 0.925, 2025: 0.962, 2026: 1.0 };

const GRAPHIES_UNITE: Record<CodeUnite, string[]> = {
  m2: ["m2", "M2", "m²"],
  ml: ["ml", "ML"],
  m3: ["m3", "M3"],
  u: ["u", "U"],
  kg: ["kg", "Kg"],
  h: ["h", "H"],
  j: ["j"],
  ens: ["ens", "Ens", "ens."],
  forfait: ["ens", "fft", "Forfait"],
};

const ALIAS_VERS_CODE = new Map(UNITES_ALIAS.map(([a, c]) => [a, c]));

const ATTRIBUTS: Record<string, Record<string, string | number | boolean>> = {
  "CM-IPN-160": { profile: "IPN", section_mm: 160, materiau: "acier", fourniture_incluse: true },
  "CM-IPN-200": { profile: "IPN", section_mm: 200, materiau: "acier", fourniture_incluse: true },
  "CM-IPE-140": { profile: "IPE", section_mm: 140, materiau: "acier", fourniture_incluse: true },
  "CM-SAB-MET": { materiau: "acier", localisation: "murs béton", fourniture_incluse: true },
  "GO-DAL-20": { epaisseur_mm: 200, materiau: "béton" },
  "ET-ISO-PU80": { epaisseur_mm: 80 },
  "ET-EP-100": { section_mm: 100, materiau: "fonte" },
  "GO-CAR-100": { section_mm: 100 },
  "RA-PEI-D3": { finition: "classe D3" },
};

/** Effet quantité : remise de volume au-delà de 150 unités. */
const EFFET_QUANTITE = new Set(["ET-BIC-AUT", "RA-END-MON", "GO-DAL-20"]);
const REMISE_VOLUME = 0.12;
const SEUIL_VOLUME = 150;
/** Nombre de lignes à placer au-delà du seuil (>= 4 de chaque côté). */
const LIGNES_AU_DESSUS: Record<string, number> = {
  "ET-BIC-AUT": 8,
  "RA-END-MON": 6,
  "GO-DAL-20": 5,
};

/** Aberrations : exactement 3 lignes à 2,5 × la médiane de leur ouvrage. */
const ABERRATIONS = new Set(["CM-IPN-160", "RA-PIQ-END", "DE-GRA-BEN"]);

// ---------------------------------------------------------------------
// Désignations brutes
// ---------------------------------------------------------------------

const sansAccents = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function designationBrute(o: OuvrageSeed, indice: number): string {
  if (o.brutes && o.brutes.length > 0) {
    return o.brutes[indice % o.brutes.length];
  }
  const candidats = [
    sansAccents(o.libelleDevis),
    o.libelleDevis.replace(/^Fourniture et pose/, "F. et pose"),
    o.libelleDevis.charAt(0).toLowerCase() + o.libelleDevis.slice(1),
    "Réalisation " + o.libelleDevis.charAt(0).toLowerCase() + o.libelleDevis.slice(1),
  ].filter((c) => c !== o.libelleDevis);
  return candidats[indice % candidats.length];
}

// ---------------------------------------------------------------------
// Plan des documents
// ---------------------------------------------------------------------

interface PlanDoc {
  cle: string;
  clientIdx: number;
  date: string; // ISO
  type: "devis" | "facture";
  estTs: boolean;
  statut: "valide" | "a_revoir";
  numero: string;
  objet: string;
  tvaTaux: number;
  /** interdit l'étanchéité (document démolition/amiante) */
  sansEtancheite?: boolean;
}

const OBJETS_NORMAUX = [
  "Réfection complète de l'étanchéité des terrasses",
  "Ravalement des façades sur rue et pignon",
  "Rénovation des parties communes — gros œuvre",
  "Reprise des balcons et garde-corps",
  "Réfection de la toiture terrasse du bâtiment B",
  "Confortement de la structure du parking",
  "Création d'ouvertures en rez-de-chaussée",
  "Reprise en sous-œuvre du mur pignon",
  "Réhabilitation lourde des terrasses et façades",
  "Travaux de gros œuvre suite à désordres structurels",
];

const OBJETS_TS = [
  "Travaux supplémentaires — reprise des poutrelles corrodées",
  "TS n°2 — renforts complémentaires suite sondages",
  "Avenant — extension du périmètre de ravalement",
  "Travaux supplémentaires suite découverte en cours de chantier",
];

function construirePlan(): { docs: PlanDoc[]; temoinIdx: number } {
  const docs: PlanDoc[] = [];

  // --- 24 documents normaux valides (dont le témoin) --------------------
  // Clients : exactement 7 non fiables ici + 1 dans les TS = 8 sur 32.
  const clientsNormaux = [
    15, 12, 1, 2, 3, 15, 12, 0, 14, 1, 2, 3, 15, 0, 1, 4, 5, 6, 7, 9, 11, 13, 14,
  ];
  const datesNormales = [
    "2024-01-15", "2024-02-19", "2024-03-25", "2024-05-06", "2024-06-17",
    "2024-07-22", "2024-09-09", "2024-10-14", "2024-11-25", "2025-01-13",
    "2025-02-24", "2025-04-07", "2025-05-19", "2025-06-30", "2025-08-25",
    "2025-09-29", "2025-11-03", "2025-12-15", "2026-01-19", "2026-02-16",
    "2026-03-23", "2026-05-11", "2026-06-22",
  ];

  // Témoin — devis Croix du Sud, reproduit à l'identique
  docs.push({
    cle: "temoin",
    clientIdx: 0,
    date: "2026-04-10",
    type: "devis",
    estTs: false,
    statut: "valide",
    numero: "DEV-2026-041",
    objet: "Reprise et renforcement des terrasses poutrelles hourdi en IPN",
    tvaTaux: 20,
  });

  clientsNormaux.forEach((clientIdx, i) => {
    docs.push({
      cle: `N${i + 1}`,
      clientIdx,
      date: datesNormales[i],
      type: i === 3 || i === 8 || i === 14 ? "facture" : "devis",
      estTs: false,
      statut: "valide",
      numero: "",
      objet: OBJETS_NORMAUX[i % OBJETS_NORMAUX.length],
      tvaTaux: i % 5 === 0 ? 10 : 20,
      sansEtancheite: i === 21, // le document démolition (amiante)
    });
  });

  // --- 6 documents TS valides -------------------------------------------
  const clientsTs = [0, 15, 2, 8, 1, 3];
  const datesTs = [
    "2024-04-22", "2024-08-19", "2025-03-17", "2025-07-21", "2025-10-20",
    "2026-05-25",
  ];
  clientsTs.forEach((clientIdx, i) => {
    docs.push({
      cle: `T${i + 1}`,
      clientIdx,
      date: datesTs[i],
      type: i === 3 ? "facture" : "devis",
      estTs: true,
      statut: "valide",
      numero: "",
      objet: OBJETS_TS[i % OBJETS_TS.length],
      tvaTaux: 20,
    });
  });

  // --- 2 documents à revoir (écart arithmétique volontaire) --------------
  docs.push({
    cle: "R1",
    clientIdx: 0,
    date: "2025-04-28",
    type: "devis",
    estTs: false,
    statut: "a_revoir",
    numero: "",
    objet: "Réfection des seuils et appuis de fenêtres",
    tvaTaux: 20,
  });
  docs.push({
    cle: "R2",
    clientIdx: 2,
    date: "2026-02-02",
    type: "devis",
    estTs: true,
    statut: "a_revoir",
    numero: "",
    objet: "TS — reprise complémentaire des acrotères",
    tvaTaux: 20,
  });

  // Numérotation par année, séquences réalistes, sans collision avec 041
  const compteurs: Record<string, number> = {
    "DEV-2024": 6, "FAC-2024": 2, "DEV-2025": 11, "FAC-2025": 4,
    "DEV-2026": 12, "FAC-2026": 5,
  };
  for (const d of docs) {
    if (d.numero) continue;
    const prefixe = d.type === "facture" ? "FAC" : "DEV";
    const annee = d.date.slice(0, 4);
    const cle = `${prefixe}-${annee}`;
    compteurs[cle] += entier(1, 3);
    if (cle === "DEV-2026" && compteurs[cle] === 41) compteurs[cle] += 1;
    d.numero = `${cle}-${String(compteurs[cle]).padStart(3, "0")}`;
  }

  return { docs, temoinIdx: 0 };
}

// ---------------------------------------------------------------------
// Lignes du document témoin (devis Croix du Sud, 10/04/2026)
// 8 lignes, total HT 49 548,00 €, TVA 20 %, TTC 59 457,60 €.
// Désignations exactement telles qu'imprimées, fautes comprises.
// ---------------------------------------------------------------------

const LIGNES_TEMOIN: Array<{
  code: string;
  designation: string;
  unite: string;
  quantite: number;
  pu: number;
  total: number;
}> = [
  { code: "FC-ETU-BET", designation: "Etude béton", unite: "ens", quantite: 1, pu: 2200, total: 2200 },
  { code: "FC-AME-REP", designation: "Amenée/repli du materiel", unite: "ens", quantite: 1, pu: 2500, total: 2500 },
  { code: "GO-PAS-POU", designation: "Pacivation des poutrelles", unite: "u", quantite: 120, pu: 34, total: 4080 },
  { code: "CM-IPN-160", designation: "Fourniture et pose d'IPN 160 porté de mur en mur 2M50 Environ", unite: "U", quantite: 120, pu: 147, total: 17640 },
  { code: "CM-SAB-MET", designation: "Fourniture et pose de sabot metalique chevillé dans les murs bétons", unite: "u", quantite: 240, pu: 51, total: 12240 },
  { code: "GO-END-POU", designation: "Enduit des poutrelles", unite: "u", quantite: 120, pu: 48, total: 5760 },
  { code: "RA-VEN-FAC", designation: "Création de ventillation en façade pour ventillation naturel", unite: "u", quantite: 12, pu: 189, total: 2268 },
  { code: "FC-DEC-ETA", designation: "Decoffrage des etaiements provisoir ( stockage sur place de parking)", unite: "ens", quantite: 1, pu: 2860, total: 2860 },
];

// somme de contrôle du témoin
{
  const somme = LIGNES_TEMOIN.reduce((s, l) => s + l.total, 0);
  if (somme !== 49548) throw new Error(`Témoin faux : ${somme} ≠ 49548`);
}

// ---------------------------------------------------------------------
// Attribution des occurrences aux documents
// ---------------------------------------------------------------------

interface LignePlan {
  docCle: string;
  code: string;
  aberrante?: boolean;
  quantiteImposee?: number;
  volumeAuDessus?: boolean;
}

function attribuerLignes(docs: PlanDoc[]): LignePlan[] {
  const lignes: LignePlan[] = [];
  const parDoc = new Map<string, Set<string>>();
  const charge = new Map<string, number>();
  for (const d of docs) {
    parDoc.set(d.cle, new Set());
    charge.set(d.cle, 0);
  }

  // le témoin contient déjà ses 8 lignes
  for (const l of LIGNES_TEMOIN) {
    parDoc.get("temoin")!.add(l.code);
    charge.set("temoin", 8);
  }

  // le témoin est figé : il ne reçoit jamais de ligne générée
  const docsNormaux = docs.filter(
    (d) => !d.estTs && d.statut === "valide" && d.cle !== "temoin",
  );
  const docsTs = docs.filter((d) => d.estTs && d.statut === "valide");

  const ajouter = (
    o: OuvrageSeed,
    quota: number,
    candidats: PlanDoc[],
    forcer?: (d: PlanDoc) => boolean,
  ) => {
    let possibles = candidats.filter(
      (d) =>
        !parDoc.get(d.cle)!.has(o.code) &&
        !(d.sansEtancheite && o.lot === "ET"),
    );
    if (forcer) {
      const forces = possibles.filter(forcer);
      const autres = possibles.filter((d) => !forcer(d));
      possibles = [...forces, ...autres];
    } else {
      possibles = [...possibles].sort(
        (a, b) => charge.get(a.cle)! - charge.get(b.cle)!,
      );
    }
    if (possibles.length < quota) {
      throw new Error(
        `Attribution impossible : ${o.code} exige ${quota} documents, ${possibles.length} disponibles`,
      );
    }
    const retenus = possibles.slice(0, quota);
    for (const d of retenus) {
      parDoc.get(d.cle)!.add(o.code);
      charge.set(d.cle, charge.get(d.cle)! + 1);
      lignes.push({ docCle: d.cle, code: o.code });
    }
    return retenus;
  };

  // 1. CM-IPN-160 en premier : le couplage sabot/platine en dépend
  const ipn = OUVRAGES.find((o) => o.code === "CM-IPN-160")!;
  const docsIpnNormaux = ajouter(ipn, ipn.n - 1, docsNormaux); // -1 : témoin
  const docsIpnTs = ajouter(ipn, ipn.nTs, docsTs);
  const dansIpnNormal = (d: PlanDoc) =>
    docsIpnNormaux.includes(d) || d.cle === "temoin";
  const dansIpnTs = (d: PlanDoc) => docsIpnTs.includes(d);

  // 2. Couplage : sabots dans les documents IPN (≈78 %, quantité double),
  //    platines (≈41 %, quantité égale)
  const sabot = OUVRAGES.find((o) => o.code === "CM-SAB-MET")!;
  ajouter(sabot, sabot.n - 1, docsNormaux, dansIpnNormal);
  ajouter(sabot, sabot.nTs, docsTs, dansIpnTs);
  const platine = OUVRAGES.find((o) => o.code === "CM-PLA-ABO")!;
  ajouter(platine, 5, docsNormaux, dansIpnNormal);
  ajouter(platine, platine.n - 5, docsNormaux, (d) => !dansIpnNormal(d));

  // 3. Tous les autres ouvrages, du quota le plus contraint au plus souple
  const temoinDeduit: Record<string, number> = {};
  for (const l of LIGNES_TEMOIN) {
    temoinDeduit[l.code] = (temoinDeduit[l.code] ?? 0) + 1;
  }
  const restants = OUVRAGES.filter(
    (o) => !["CM-IPN-160", "CM-SAB-MET", "CM-PLA-ABO"].includes(o.code),
  ).sort((a, b) => b.n - a.n);

  for (const o of restants) {
    const quotaNormal = o.n - (temoinDeduit[o.code] ?? 0);
    if (o.code === "DE-DES-AMI") {
      // l'amiante va sur le document démolition dédié
      ajouter(o, quotaNormal, docsNormaux, (d) => d.sansEtancheite === true);
    } else {
      ajouter(o, quotaNormal, docsNormaux);
    }
    if (o.nTs > 0) ajouter(o, o.nTs, docsTs);
  }

  // 4. Effet quantité : marquer les lignes au-dessus du seuil
  for (const [code, nb] of Object.entries(LIGNES_AU_DESSUS)) {
    const concernees = lignes.filter(
      (l) => l.code === code && docs.find((d) => d.cle === l.docCle)!.statut === "valide"
        && !docs.find((d) => d.cle === l.docCle)!.estTs,
    );
    for (let i = 0; i < nb; i++) {
      concernees[i * 2 % concernees.length].volumeAuDessus = true;
    }
  }

  // 5. Aberrations : une ligne normale (hors témoin) par ouvrage ciblé
  for (const code of ABERRATIONS) {
    const cible = lignes.find(
      (l) =>
        l.code === code &&
        l.docCle !== "temoin" &&
        !docs.find((d) => d.cle === l.docCle)!.estTs &&
        !l.volumeAuDessus,
    );
    if (!cible) throw new Error(`Aberration impossible sur ${code}`);
    cible.aberrante = true;
  }

  return lignes;
}

// ---------------------------------------------------------------------
// Quantités et prix
// ---------------------------------------------------------------------

function quantitePour(o: OuvrageSeed, ligne: LignePlan): number {
  if (o.forfaitaire) return 1;
  if (EFFET_QUANTITE.has(o.code)) {
    return ligne.volumeAuDessus ? entier(170, 340) : entier(25, 135);
  }
  switch (o.unite) {
    case "m2": return entier(15, 220);
    case "ml": return entier(4, 60);
    case "m3": return entier(2, 35);
    case "u": return entier(2, 24);
    case "kg": return entier(50, 800);
    case "h": return entier(4, 40);
    default: return entier(1, 20);
  }
}

function puPour(
  o: OuvrageSeed,
  doc: PlanDoc,
  zone: CodeZone,
  ligne: LignePlan,
): number {
  if (ligne.aberrante) return arrondirPu(o.pu * 2.5);
  const annee = Number(doc.date.slice(0, 4));
  let pu = o.pu * COEF_ZONE[zone] * (COEF_ANNEE[annee] ?? 1);
  if (doc.estTs) pu *= 1 + o.majTs;
  if (ligne.volumeAuDessus) pu *= 1 - REMISE_VOLUME;
  pu *= 1 + bruit(o.cv);
  return Math.max(arrondirPu(pu), 0.5);
}

// ---------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------

async function main() {
  console.log("— Purge des tables…");
  await sql`truncate table journal_acces, acces, rattachements, lignes_source,
    documents, clients_alias, clients, ouvrages, lots, unites_alias, unites,
    zones_communes, zones, index_prix restart identity cascade`;

  // --- Référentiels ------------------------------------------------------
  console.log("— Référentiels…");
  const zoneIds = new Map<CodeZone, string>();
  for (const z of ZONES) {
    const [r] = await sql`insert into zones (code, libelle, ordre)
      values (${z.code}, ${z.libelle}, ${z.ordre}) returning id`;
    zoneIds.set(z.code, r.id);
  }
  for (const [cp, commune, zone] of COMMUNES) {
    await sql`insert into zones_communes (code_postal, commune, zone_id)
      values (${cp}, ${commune}, ${zoneIds.get(zone)!})
      on conflict do nothing`;
  }
  for (const [code, libelle, forfaitaire, agregable] of UNITES) {
    await sql`insert into unites (code, libelle, est_forfaitaire, agregable)
      values (${code}, ${libelle}, ${forfaitaire}, ${agregable})`;
  }
  for (const [alias, code, facteur] of UNITES_ALIAS) {
    await sql`insert into unites_alias (alias, code_unite, facteur)
      values (${alias}, ${code}, ${facteur}) on conflict do nothing`;
  }
  for (const ip of genererIndexPrix()) {
    await sql`insert into index_prix (mois, coefficient, source)
      values (${ip.mois}, ${ip.coefficient}, 'coefficient maison 4 %/an')`;
  }

  // --- Clients ------------------------------------------------------------
  const clientIds: string[] = [];
  const zoneClient: CodeZone[] = [];
  for (const c of CLIENTS) {
    const zc = COMMUNES.find(([cp]) => cp === c.cp)?.[2] ?? "83_AUTRE";
    const [r] = await sql`insert into clients
      (nom_normalise, type_client, code_postal, commune, adresse_vaut_chantier)
      values (${c.nom}, ${c.type}, ${c.cp}, ${c.commune}, ${c.adresseVautChantier})
      returning id`;
    clientIds.push(r.id);
    zoneClient.push(zc);
  }
  const aliasClients: Array<[string, number]> = [
    ["COPRO CROIX DU SUD", 0],
    ["Copro. de la Croix du Sud", 0],
    ["FONCIA VAR EST", 5],
    ["S.C.I. Les Oliviers", 7],
  ];
  for (const [alias, idx] of aliasClients) {
    await sql`insert into clients_alias (alias, client_id)
      values (${alias}, ${clientIds[idx]})`;
  }

  // --- Lots et ouvrages ----------------------------------------------------
  console.log("— Lots et ouvrages…");
  const lotIds = new Map<string, string>();
  for (const l of LOTS) {
    const [r] = await sql`insert into lots (code, libelle, parent_id, ordre)
      values (${l.code}, ${l.libelle},
        ${l.parent ? lotIds.get(l.parent)! : null}, ${l.ordre})
      returning id`;
    lotIds.set(l.code, r.id);
  }
  const ouvrageIds = new Map<string, string>();
  for (const o of OUVRAGES) {
    const [r] = await sql`insert into ouvrages
      (lot_id, code, libelle_normalise, libelle_devis, unite_reference,
       attributs_cles, est_forfaitaire, actif, valide_par, valide_le)
      values (${lotIds.get(o.lot)!}, ${o.code}, ${o.libelleNormalise},
        ${o.libelleDevis}, ${o.unite},
        ${sql.json(ATTRIBUTS[o.code] ?? {})}, ${o.forfaitaire ?? false},
        true, 'atelier de calage', now())
      returning id`;
    ouvrageIds.set(o.code, r.id);
  }
  const parCode = new Map(OUVRAGES.map((o) => [o.code, o]));

  // --- Documents et lignes --------------------------------------------------
  console.log("— Documents et lignes…");
  const { docs } = construirePlan();
  const lignesPlan = attribuerLignes(docs);

  let totalLignes = 0;
  let lignesEnAttente = 0;
  const brutesCompteur = new Map<string, number>();
  const graphieCompteur = new Map<string, number>();

  for (const doc of docs) {
    const client = CLIENTS[doc.clientIdx];
    const zone = zoneClient[doc.clientIdx];
    const zoneFiable = client.adresseVautChantier;

    interface LigneAInserer {
      code: string;
      designation: string;
      uniteBrute: string;
      quantite: number;
      pu: number;
      total: number;
      estForfait: boolean;
      controle: "ok" | "ecart";
      ecart: number;
      valide: boolean;
      score: number | null;
    }
    const aInserer: LigneAInserer[] = [];

    if (doc.cle === "temoin") {
      for (const l of LIGNES_TEMOIN) {
        aInserer.push({
          code: l.code,
          designation: l.designation,
          uniteBrute: l.unite,
          quantite: l.quantite,
          pu: l.pu,
          total: l.total,
          estForfait: parCode.get(l.code)!.forfaitaire ?? false,
          controle: "ok",
          ecart: 0,
          valide: true,
          score: null,
        });
      }
    } else {
      const lignesDoc = lignesPlan.filter((l) => l.docCle === doc.cle);
      // quantités IPN d'abord pour le couplage sabot/platine
      const qteIpn = new Map<string, number>();
      const nonForfaits = lignesDoc.filter((l) => !parCode.get(l.code)!.forfaitaire);
      const forfaits = lignesDoc.filter((l) => parCode.get(l.code)!.forfaitaire);

      let sommeNonForfait = 0;
      for (const lp of nonForfaits) {
        const o = parCode.get(lp.code)!;
        let quantite = quantitePour(o, lp);
        if (lp.code === "CM-IPN-160") qteIpn.set(doc.cle, quantite);
        if (lp.code === "CM-SAB-MET" && qteIpn.has(doc.cle)) {
          quantite = qteIpn.get(doc.cle)! * 2;
        }
        if (lp.code === "CM-PLA-ABO" && qteIpn.has(doc.cle)) {
          quantite = qteIpn.get(doc.cle)!;
        }
        const pu = puPour(o, doc, zone, lp);
        const total = arrondir2(quantite * pu);
        sommeNonForfait += total;

        const iBrute = brutesCompteur.get(lp.code) ?? 0;
        brutesCompteur.set(lp.code, iBrute + 1);
        const iGraphie = graphieCompteur.get(o.unite) ?? 0;
        graphieCompteur.set(o.unite, iGraphie + 1);
        const graphies = GRAPHIES_UNITE[o.unite];

        aInserer.push({
          code: lp.code,
          designation: designationBrute(o, iBrute),
          uniteBrute: graphies[iGraphie % graphies.length],
          quantite,
          pu,
          total,
          estForfait: false,
          controle: "ok",
          ecart: 0,
          valide: true,
          score: null,
        });
      }

      // forfaits en dernier : % du montant non forfaitaire du document
      for (const lp of forfaits) {
        const o = parCode.get(lp.code)!;
        const pct = (o.pctChantier ?? 4) / 100;
        let montant = sommeNonForfait * pct * (1 + bruit(o.cv));
        montant = Math.max(Math.round(montant / 10) * 10, 150);
        if (doc.estTs) montant = Math.round(montant * (1 + o.majTs));
        const iBrute = brutesCompteur.get(lp.code) ?? 0;
        brutesCompteur.set(lp.code, iBrute + 1);
        const graphies = GRAPHIES_UNITE.forfait;
        aInserer.push({
          code: lp.code,
          designation: designationBrute(o, iBrute),
          uniteBrute: graphies[iBrute % graphies.length],
          quantite: 1,
          pu: montant,
          total: montant,
          estForfait: true,
          controle: "ok",
          ecart: 0,
          valide: true,
          score: null,
        });
      }

      // documents à revoir : une ligne dont le total imprimé est faux
      if (doc.statut === "a_revoir" && aInserer.length > 0) {
        const cible = aInserer[1] ?? aInserer[0];
        const ecart = doc.cle === "R1" ? 180 : -240;
        cible.total = arrondir2(cible.total + ecart);
        cible.controle = "ecart";
        cible.ecart = ecart;
      }
    }

    const totalHt = arrondir2(aInserer.reduce((s, l) => s + l.total, 0));
    const totalTtc = arrondir2(totalHt * (1 + doc.tvaTaux / 100));
    const lignesEnEcart = aInserer.filter((l) => l.controle === "ecart").length;
    const ecartTotal = arrondir2(
      aInserer.reduce((s, l) => s + l.ecart, 0),
    );

    const [docRow] = await sql`insert into documents
      (fichier_nom, fichier_hash, storage_path, nb_pages, type_document, est_ts,
       numero_document, date_document, client_nom_brut, client_id,
       chantier_objet, chantier_code_postal, chantier_commune, zone_id,
       zone_fiable, total_ht, tva_taux, total_ttc,
       extraction_modele, extraction_version, extraction_confiance, raw_json,
       controle_total, ecart_total, statut)
      values
      (${doc.numero + ".pdf"}, ${"seed-" + doc.numero}, null,
       ${entier(1, 4)}, ${doc.type}, ${doc.estTs},
       ${doc.numero}, ${doc.date}, ${CLIENTS[doc.clientIdx].nom},
       ${clientIds[doc.clientIdx]}, ${doc.objet},
       ${zoneFiable ? client.cp : null}, ${zoneFiable ? client.commune : null},
       ${zoneIds.get(zone)!}, ${zoneFiable},
       ${totalHt}, ${doc.tvaTaux}, ${totalTtc},
       'seed-demo', '1.0', 0.98, ${sql.json({ seed: true })},
       ${doc.statut === "a_revoir" ? "ecart" : "ok"},
       ${doc.statut === "a_revoir" ? ecartTotal : 0},
       ${doc.statut})
      returning id`;

    let ordre = 0;
    for (const l of aInserer) {
      ordre += 1;
      const codeUnite = ALIAS_VERS_CODE.get(l.uniteBrute) ?? null;
      const o = parCode.get(l.code)!;
      const [ligneRow] = await sql`insert into lignes_source
        (document_id, page, ordre, designation_brute, unite_brute, quantite,
         pu_ht, total_ht, unite_code, quantite_normalisee, est_titre,
         est_forfait, attributs, controle_ligne, ecart, confiance)
        values
        (${docRow.id}, 1, ${ordre}, ${l.designation}, ${l.uniteBrute},
         ${l.quantite}, ${l.pu}, ${l.total}, ${codeUnite}, ${l.quantite},
         false, ${l.estForfait}, ${sql.json(ATTRIBUTS[l.code] ?? {})},
         ${l.controle}, ${l.ecart}, 0.97)
        returning id`;
      await sql`insert into rattachements
        (ligne_source_id, ouvrage_id, score, methode, valide, valide_par, valide_le)
        values (${ligneRow.id}, ${ouvrageIds.get(l.code)!},
          ${l.score ?? 0.94}, 'manuel', ${l.valide},
          ${l.valide ? "atelier de calage" : null},
          ${l.valide ? sql`now()` : null})`;
      totalLignes += 1;
      void o;
    }
  }

  // --- 60 lignes supplémentaires en attente de calage ----------------------
  // (rattachements non validés, score 0,42–0,78 : elles n'entrent pas dans
  //  les statistiques et alimentent la file de /calage)
  console.log("— File de calage (60 lignes en attente)…");
  const docsValides = await sql`select id, date_document, est_ts, zone_id
    from documents
    where statut = 'valide' and numero_document <> 'DEV-2026-041'
    order by date_document`;
  const candidatsAttente = OUVRAGES.filter((o) => !o.forfaitaire);
  for (let i = 0; i < 60; i++) {
    const doc = docsValides[i % docsValides.length];
    const o = candidatsAttente[(i * 7) % candidatsAttente.length];
    const iBrute = brutesCompteur.get(o.code) ?? 0;
    brutesCompteur.set(o.code, iBrute + 1);
    const quantite = quantitePour(o, { docCle: "", code: o.code });
    const zoneCode = ZONES.find(
      (z) => zoneIds.get(z.code) === doc.zone_id,
    )!.code;
    const pu = puPour(
      o,
      {
        date: doc.date_document.toISOString?.().slice(0, 10) ?? String(doc.date_document),
        estTs: doc.est_ts,
      } as PlanDoc,
      zoneCode,
      { docCle: "", code: o.code },
    );
    const total = arrondir2(quantite * pu);
    const graphies = GRAPHIES_UNITE[o.unite];
    const [ordreRow] = await sql`select coalesce(max(ordre), 0) + 1 as suivant
      from lignes_source where document_id = ${doc.id}`;
    const [ligneRow] = await sql`insert into lignes_source
      (document_id, page, ordre, designation_brute, unite_brute, quantite,
       pu_ht, total_ht, unite_code, quantite_normalisee, est_titre,
       est_forfait, attributs, controle_ligne, ecart, confiance)
      values
      (${doc.id}, 1, ${ordreRow.suivant}, ${designationBrute(o, iBrute)},
       ${graphies[i % graphies.length]}, ${quantite}, ${pu}, ${total},
       ${ALIAS_VERS_CODE.get(graphies[i % graphies.length]) ?? null},
       ${quantite}, false, false, ${sql.json(ATTRIBUTS[o.code] ?? {})},
       'ok', 0, 0.62)
      returning id`;
    const score = Math.round((0.42 + alea() * 0.36) * 1000) / 1000;
    await sql`insert into rattachements
      (ligne_source_id, ouvrage_id, score, methode, valide)
      values (${ligneRow.id}, ${ouvrageIds.get(o.code)!}, ${score},
        'embedding', false)`;
    lignesEnAttente += 1;
    totalLignes += 1;
  }

  // recaler les totaux des documents après l'ajout des lignes en attente
  await sql`update documents d set
      total_ht = s.somme,
      total_ttc = round(s.somme * (1 + d.tva_taux / 100), 2)
    from (select document_id, sum(total_ht) as somme
          from lignes_source group by document_id) s
    where s.document_id = d.id and d.statut = 'valide'
      and d.numero_document <> 'DEV-2026-041'`;

  // --- Accès ---------------------------------------------------------------
  console.log("— Codes d'accès…");
  await sql`insert into acces (libelle, code_hash, est_admin) values
    ('Métreur 1', ${bcrypt.hashSync("sodobat2026", 10)}, false),
    ('Direction', ${bcrypt.hashSync("admin2026", 10)}, true)`;

  // --- Agrégats --------------------------------------------------------------
  console.log("— Rafraîchissement des agrégats…");
  await sql`select rafraichir_agregats()`;

  // --- Contrôles de sortie ---------------------------------------------------
  console.log("\n=== RÉCAPITULATIF ===");
  const [nOuvrages] = await sql`select count(*)::int as n from ouvrages`;
  const [nDocs] = await sql`select count(*)::int as n from documents`;
  const [nLignes] = await sql`select count(*)::int as n from lignes_source`;
  const [nAttente] =
    await sql`select count(*)::int as n from rattachements where valide is false`;
  const fiabilites = await sql`select fiabilite, count(*)::int as n
    from mv_stats_ouvrage where niveau = 'global' group by fiabilite`;
  const [temoin] = await sql`select total_ht, total_ttc,
      (select count(*)::int from lignes_source l where l.document_id = d.id) as nb
    from documents d where numero_document = 'DEV-2026-041'`;
  const [ipnStats] = await sql`select s.n from mv_stats_ouvrage s
    join ouvrages o on o.id = s.ouvrage_id
    where o.code = 'CM-IPN-160' and s.niveau = 'type' and s.est_ts = false`;
  const [merc] = await sql`select count(*)::int as n from documents d
    join zones z on z.id = d.zone_id where z.code = 'MERCANTOUR'`;
  const [nonFiables] =
    await sql`select count(*)::int as n from documents where zone_fiable = false`;

  console.log(`Ouvrages        : ${nOuvrages.n}`);
  console.log(`Documents       : ${nDocs.n} (Mercantour : ${merc.n}, zone non fiable : ${nonFiables.n})`);
  console.log(`Lignes source   : ${nLignes.n} (dont ${nAttente.n} en attente de calage)`);
  console.log(`Fiabilités      : ${fiabilites.map((f) => `${f.fiabilite}=${f.n}`).join(" · ")}`);
  console.log(`Témoin          : ${temoin.total_ht} € HT · ${temoin.total_ttc} € TTC · ${temoin.nb} lignes`);
  console.log(`IPN 160 normaux : n=${ipnStats?.n}`);

  const faible = fiabilites.find((f) => f.fiabilite === "faible");
  if (!faible || faible.n === 0) {
    throw new Error("ÉCHEC DU SEED : aucun ouvrage en fiabilité 'faible'.");
  }
  if (Number(temoin.total_ht) !== 49548 || temoin.nb !== 8) {
    throw new Error("ÉCHEC DU SEED : document témoin incorrect.");
  }
  if (nDocs.n !== 32) {
    throw new Error(`ÉCHEC DU SEED : ${nDocs.n} documents au lieu de 32.`);
  }

  console.log("\nSeed terminé.");
  console.log("Codes d'accès de démonstration : sodobat2026 (métreur) · admin2026 (direction/admin)");
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
