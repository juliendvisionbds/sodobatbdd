// =====================================================================
// Sérialisation des filtres dans l'URL : l'état de l'écran est
// toujours partageable par simple copie du lien.
// =====================================================================

import {
  FILTRES_DEFAUT,
  type CodeUnite,
  type CodeZone,
  type ColonneTriPrix,
  type Fiabilite,
  type FiltresCalage,
  type FiltresHistorique,
  type FiltresPrix,
  type StatutDocument,
  type Tri,
  type TypeDocument,
  type TypeTravaux,
} from "./types";

export type ParamsRecherche = Record<string, string | string[] | undefined>;

const ZONES_VALIDES: CodeZone[] = ["06", "MERCANTOUR", "TOULON", "83_AUTRE"];
const UNITES_VALIDES: CodeUnite[] = [
  "m2", "ml", "m3", "u", "kg", "h", "j", "ens", "forfait",
];
const COLONNES_TRI: ColonneTriPrix[] = [
  "libelle", "lot", "unite", "prix", "n", "derniere_occurrence",
];

function premier(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function lireFiltres(params: ParamsRecherche): FiltresPrix {
  const zones = premier(params.zones)
    ?.split(",")
    .filter((z): z is CodeZone => ZONES_VALIDES.includes(z as CodeZone));
  const unites = premier(params.unites)
    ?.split(",")
    .filter((u): u is CodeUnite => UNITES_VALIDES.includes(u as CodeUnite));
  const type = premier(params.type);
  const fiab = premier(params.fiab);
  const nMin = Number(premier(params.nmin));

  return {
    ...FILTRES_DEFAUT,
    recherche: premier(params.q) || undefined,
    lotId: premier(params.lot) || undefined,
    zones: zones && zones.length > 0 ? zones : undefined,
    typeTravaux: (["normaux", "ts", "tous"].includes(type ?? "")
      ? type
      : "tous") as TypeTravaux,
    unites: unites && unites.length > 0 ? unites : undefined,
    depuis: premier(params.depuis) || undefined,
    jusquA: premier(params.jusqua) || undefined,
    nMinimum: Number.isFinite(nMin) && nMin > 0 ? nMin : undefined,
    fiabiliteMinimum: (["haute", "moyenne", "faible"].includes(fiab ?? "")
      ? fiab
      : undefined) as Fiabilite | undefined,
    // prix actualisés retirés de l'interface (index BT01 non chargé)
    indexe: false,
    inclureSansPrix: premier(params.sansprix) === "1",
  };
}

const STATUTS_DOCUMENT: StatutDocument[] = ["importe", "a_revoir", "valide", "rejete"];

export function lireFiltresCalage(params: ParamsRecherche): FiltresCalage {
  const methode = premier(params.methode);
  const doc = premier(params.doc);
  return {
    lotId: premier(params.lot) || undefined,
    methode: (["regle", "llm", "auto"].includes(methode ?? "")
      ? methode
      : undefined) as FiltresCalage["methode"],
    statutDoc: STATUTS_DOCUMENT.includes(doc as StatutDocument)
      ? (doc as StatutDocument)
      : undefined,
    recherche: premier(params.q)?.trim() || undefined,
  };
}

export function nbFiltresCalageActifs(f: FiltresCalage): number {
  return [f.lotId, f.methode, f.statutDoc, f.recherche].filter(Boolean).length;
}

export function lireTri(params: ParamsRecherche): Tri<ColonneTriPrix> {
  const colonne = premier(params.tri);
  const sens = premier(params.sens);
  return {
    colonne: COLONNES_TRI.includes(colonne as ColonneTriPrix)
      ? (colonne as ColonneTriPrix)
      : "libelle",
    sens: sens === "desc" ? "desc" : "asc",
  };
}

export function lirePage(params: ParamsRecherche): number {
  const p = Number(premier(params.page));
  return Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1;
}

const TYPES_DOCUMENT: TypeDocument[] = [
  "devis", "facture", "situation", "avenant", "indetermine",
];

export function lireFiltresHistorique(
  params: ParamsRecherche,
): FiltresHistorique {
  const zones = premier(params.zones)
    ?.split(",")
    .filter((z): z is CodeZone => ZONES_VALIDES.includes(z as CodeZone));
  const types = premier(params.types)
    ?.split(",")
    .filter((t): t is TypeDocument =>
      TYPES_DOCUMENT.includes(t as TypeDocument),
    );
  const type = premier(params.type);
  const min = Number(premier(params.min));
  const max = Number(premier(params.max));

  return {
    recherche: premier(params.q) || undefined,
    clientId: premier(params.client) || undefined,
    lotId: premier(params.lot) || undefined,
    ouvrageId: premier(params.ouvrage_filtre) || undefined,
    zones: zones && zones.length > 0 ? zones : undefined,
    types: types && types.length > 0 ? types : undefined,
    typeTravaux: (["normaux", "ts", "tous"].includes(type ?? "")
      ? type
      : "tous") as TypeTravaux,
    depuis: premier(params.depuis) || undefined,
    jusquA: premier(params.jusqua) || undefined,
    montantMin: Number.isFinite(min) && min > 0 ? min : undefined,
    montantMax: Number.isFinite(max) && max > 0 ? max : undefined,
  };
}

export function nbFiltresHistoriqueActifs(f: FiltresHistorique): number {
  let n = 0;
  if (f.recherche) n++;
  if (f.clientId) n++;
  if (f.lotId || f.ouvrageId) n++;
  if (f.zones?.length) n++;
  if (f.types?.length) n++;
  if (f.typeTravaux && f.typeTravaux !== "tous") n++;
  if (f.depuis || f.jusquA) n++;
  if (f.montantMin != null || f.montantMax != null) n++;
  return n;
}

/** Nombre de filtres actifs (pour le bouton « Effacer »). */
export function nbFiltresActifs(f: FiltresPrix): number {
  let n = 0;
  if (f.recherche) n++;
  if (f.lotId) n++;
  if (f.zones?.length) n++;
  if (f.typeTravaux && f.typeTravaux !== "tous") n++;
  if (f.unites?.length) n++;
  if (f.depuis || f.jusquA) n++;
  if (f.nMinimum) n++;
  if (f.fiabiliteMinimum) n++;
  return n;
}
