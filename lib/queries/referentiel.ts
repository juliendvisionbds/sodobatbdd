// =====================================================================
// lib/queries/referentiel.ts — implémente RequetesReferentiel.
// Arbre des lots, recherche d'ouvrages, files de calage (ligne à ligne,
// par ouvrage, sans ouvrage), validation en masse, journal d'annulation,
// documents à revoir, propositions de fusion.
//
// Toute écriture sur un rattachement passe par le journal
// (calage_journal) : un geste = un lot, annulable par
// annulerDerniereAction(). Les fonctions de masse prennent
// `rafraichir: false` quand l'appelant regroupe le recalcul en fin.
// =====================================================================

import type { TransactionSql } from "postgres";
import { sql } from "../db";
import type {
  CodeUnite,
  ControleLigne,
  DocumentARevoir,
  FiltresCalage,
  FusionProposee,
  GroupeCalage,
  LigneCalage,
  LotNoeud,
  MethodeRattachement,
  Ouvrage,
  Page,
  ProgressionCalage,
  RattachementAValider,
  StatutDocument,
  SyntheseBase,
  UUID,
} from "../types";
import { versLigneContexte } from "./ouvrages";

type Tx = TransactionSql<Record<string, never>>;

export interface OptionsEcriture {
  /** Défaut true. Les scripts passent false et rafraîchissent une fois en fin. */
  rafraichir?: boolean;
  acteur?: string;
}

async function rafraichir(o?: OptionsEcriture) {
  if (o?.rafraichir === false) return;
  await sql`select rafraichir_agregats()`;
}

// ---------------------------------------------------------------------
// Arbre des lots
// ---------------------------------------------------------------------

export async function arbreLots(): Promise<LotNoeud[]> {
  const lots = await sql`
    select l.id, l.code, l.libelle, l.parent_id, l.ordre,
           (select count(*)::int from ouvrages o
             where o.lot_id = l.id and o.actif = true) as nb_ouvrages,
           (select count(*)::int from ouvrages o
             where o.lot_id = l.id and o.actif = true
               and exists (select 1 from v_lignes_agregables v
                           where v.ouvrage_id = o.id)) as nb_avec_prix
    from lots l
    order by l.ordre, l.code`;

  const noeuds = new Map<UUID, LotNoeud>();
  for (const r of lots) {
    noeuds.set(r.id as UUID, {
      id: r.id as UUID,
      code: r.code as string,
      libelle: r.libelle as string,
      parentId: (r.parent_id as UUID) ?? null,
      ordre: Number(r.ordre),
      enfants: [],
      nbOuvrages: Number(r.nb_ouvrages),
      nbOuvragesCumule: Number(r.nb_ouvrages),
      nbAvecPrix: Number(r.nb_avec_prix),
      nbAvecPrixCumule: Number(r.nb_avec_prix),
    });
  }
  const racines: LotNoeud[] = [];
  for (const n of noeuds.values()) {
    if (n.parentId && noeuds.has(n.parentId)) {
      noeuds.get(n.parentId)!.enfants.push(n);
    } else {
      racines.push(n);
    }
  }
  const cumuler = (n: LotNoeud): [number, number] => {
    let total = n.nbOuvrages;
    let avecPrix = n.nbAvecPrix;
    for (const e of n.enfants) {
      const [t, p] = cumuler(e);
      total += t;
      avecPrix += p;
    }
    n.nbOuvragesCumule = total;
    n.nbAvecPrixCumule = avecPrix;
    return [total, avecPrix];
  };
  racines.forEach(cumuler);
  return racines;
}

async function idsLotAvecDescendants(lotId: UUID): Promise<UUID[]> {
  const lignes = await sql`
    with recursive arbre as (
      select id from lots where id = ${lotId}
      union all
      select l.id from lots l join arbre a on l.parent_id = a.id
    )
    select id from arbre`;
  return lignes.map((r) => r.id as UUID);
}

// ---------------------------------------------------------------------
// Ouvrages
// ---------------------------------------------------------------------

const SELECT_OUVRAGE = sql`
  o.id, o.code, o.lot_id, l.code as lot_code, l.libelle as lot_libelle,
  o.libelle_devis, o.libelle_normalise, o.description_longue,
  o.notes_specifiques, o.unite_reference, o.est_forfaitaire, o.actif
`;

function versOuvrage(r: Record<string, unknown>): Ouvrage {
  return {
    id: r.id as UUID,
    code: (r.code as string) ?? null,
    lotId: (r.lot_id as UUID) ?? null,
    lotCode: (r.lot_code as string) ?? null,
    lotLibelle: (r.lot_libelle as string) ?? null,
    libelleDevis: r.libelle_devis as string,
    libelleNormalise: r.libelle_normalise as string,
    descriptionLongue: (r.description_longue as string) ?? null,
    notesSpecifiques: (r.notes_specifiques as string) ?? null,
    unite: (r.unite_reference as CodeUnite) ?? null,
    estForfaitaire: Boolean(r.est_forfaitaire),
    actif: Boolean(r.actif),
  };
}

async function lireOuvrage(id: UUID): Promise<Ouvrage> {
  const [r] = await sql`
    select ${SELECT_OUVRAGE}
    from ouvrages o left join lots l on l.id = o.lot_id
    where o.id = ${id}`;
  if (!r) throw new Error("Ouvrage introuvable.");
  return versOuvrage(r);
}

export async function chercherOuvrages(
  requete: string,
  limite = 10,
): Promise<Ouvrage[]> {
  const terme = requete.trim();
  const motif = "%" + terme + "%";
  const lignes = await sql`
    select ${SELECT_OUVRAGE},
           greatest(
             case when o.code ilike ${motif} then 1.0 else 0 end,
             word_similarity(f_unaccent(lower(${terme})), f_unaccent(lower(o.libelle_devis))),
             word_similarity(f_unaccent(lower(${terme})), o.libelle_normalise),
             similarity(f_unaccent(lower(${terme})), f_unaccent(lower(o.libelle_devis)))
           ) as score
    from ouvrages o
    left join lots l on l.id = o.lot_id
    where o.actif = true and (
      o.code ilike ${motif}
      or f_unaccent(lower(o.libelle_devis)) like '%' || f_unaccent(lower(${terme})) || '%'
      or f_unaccent(lower(o.libelle_normalise)) like '%' || f_unaccent(lower(${terme})) || '%'
      or word_similarity(f_unaccent(lower(${terme})), f_unaccent(lower(o.libelle_devis))) > 0.3
      or word_similarity(f_unaccent(lower(${terme})), o.libelle_normalise) > 0.3
      or exists (
        select 1 from rattachements r
        join lignes_source ls on ls.id = r.ligne_source_id
        where r.ouvrage_id = o.id
          and (ls.designation_recherche like '%' || f_unaccent(lower(${terme})) || '%'
               or word_similarity(f_unaccent(lower(${terme})), ls.designation_recherche) > 0.4)
      )
    )
    order by score desc, o.libelle_devis
    limit ${limite}
  `;
  return lignes.map(versOuvrage);
}

// ---------------------------------------------------------------------
// Journal de calage — chaque geste est annulable
// ---------------------------------------------------------------------

const CHAMPS_SNAPSHOT = sql`
  r.id, r.ouvrage_id, r.valide, r.methode, r.score, r.valide_par,
  r.valide_le::text as valide_le
`;

type Snapshot = {
  id: UUID;
  ouvrage_id: UUID;
  valide: boolean;
  methode: string;
  score: number | null;
  valide_par: string | null;
  valide_le: string | null;
};

async function snapshots(tx: Tx, ids: UUID[]): Promise<Snapshot[]> {
  if (ids.length === 0) return [];
  const lignes = await tx`
    select ${CHAMPS_SNAPSHOT} from rattachements r where r.id = any(${ids})`;
  return lignes.map((r) => ({
    id: r.id as UUID,
    ouvrage_id: r.ouvrage_id as UUID,
    valide: Boolean(r.valide),
    methode: r.methode as string,
    score: r.score === null ? null : Number(r.score),
    valide_par: (r.valide_par as string) ?? null,
    valide_le: (r.valide_le as string) ?? null,
  }));
}

async function journaliser(
  tx: Tx,
  lotId: UUID,
  action: string,
  entrees: Array<{
    rattachementId: UUID;
    avant: Snapshot | null;
    apres: Partial<Snapshot> | null;
    ouvrageCreeId?: UUID | null;
    ouvrageFusionneId?: UUID | null;
  }>,
  acteur?: string,
): Promise<void> {
  if (entrees.length === 0) return;
  // une insertion par entrée : sql.json garantit un jsonb objet (et non
  // une chaîne JSON encapsulée), ce dont l'annulation dépend
  for (const e of entrees) {
    await tx`insert into calage_journal
      (lot_id, action, rattachement_id, avant, apres,
       ouvrage_cree_id, ouvrage_fusionne_id, acteur)
      values (${lotId}, ${action}, ${e.rattachementId},
              ${e.avant ? tx.json(e.avant as never) : null},
              ${e.apres ? tx.json(e.apres as never) : null},
              ${e.ouvrageCreeId ?? null}, ${e.ouvrageFusionneId ?? null},
              ${acteur ?? "calage"})`;
  }
}

function nouveauLot(): UUID {
  return crypto.randomUUID();
}

/** Valide une liste de rattachements (journalisé). Renvoie les ids
 *  effectivement passés en validé. `ouvrageId` repointe d'abord. */
async function validerEnTransaction(
  tx: Tx,
  ids: UUID[],
  action: string,
  o: OptionsEcriture & { ouvrageId?: UUID; lotId?: UUID },
): Promise<{ ids: UUID[]; lotId: UUID }> {
  const lotId = o.lotId ?? nouveauLot();
  const acteur = o.acteur ?? "calage";
  const avant = await snapshots(tx, ids);
  const cibles = avant.filter(
    (s) => !s.valide || (o.ouvrageId && s.ouvrage_id !== o.ouvrageId),
  );
  if (cibles.length === 0) return { ids: [], lotId };
  const idsCibles = cibles.map((s) => s.id);
  await tx`update rattachements
    set valide = true,
        valide_par = ${acteur},
        valide_le = now()
        ${o.ouvrageId ? tx`, ouvrage_id = ${o.ouvrageId}, methode = 'manuel', score = 1` : tx``}
    where id = any(${idsCibles})`;
  await journaliser(
    tx,
    lotId,
    action,
    cibles.map((s) => ({
      rattachementId: s.id,
      avant: s,
      apres: {
        valide: true,
        valide_par: acteur,
        ouvrage_id: o.ouvrageId ?? s.ouvrage_id,
      },
    })),
    acteur,
  );
  return { ids: idsCibles, lotId };
}

export async function validerRattachement(
  id: UUID,
  ouvrageId?: UUID,
  o: OptionsEcriture = {},
): Promise<void> {
  await sql.begin(async (tx) => {
    await validerEnTransaction(tx as Tx, [id], ouvrageId ? "modifier" : "valider", {
      ...o,
      ouvrageId,
    });
  });
  await rafraichir(o);
}

export async function validerRattachements(
  ids: UUID[],
  o: OptionsEcriture = {},
): Promise<UUID[]> {
  if (ids.length === 0) return [];
  const r = await sql.begin(async (tx) =>
    validerEnTransaction(tx as Tx, ids, "valider", o),
  );
  await rafraichir(o);
  return r.ids;
}

/** Valide tout ce qui est en attente sur un ouvrage. */
export async function validerParOuvrage(
  ouvrageId: UUID,
  o: OptionsEcriture & {
    seulementUniteCompatible?: boolean;
    exclureIds?: UUID[];
    filtres?: FiltresCalage;
    action?: string;
  } = {},
): Promise<{ ids: UUID[]; lotId: UUID }> {
  const exclure = o.exclureIds ?? [];
  const cond = condFiltresCalage(o.filtres, await lotsPourFiltres(o.filtres));
  const lignes = await sql`
    select r.id
    from rattachements r
    join lignes_source l on l.id = r.ligne_source_id
    join documents d on d.id = l.document_id
    join ouvrages o on o.id = r.ouvrage_id
    where r.ouvrage_id = ${ouvrageId}
      and r.valide = false
      and d.statut <> 'rejete'
      and not (r.id = any(${exclure}))
      ${o.seulementUniteCompatible
        ? sql`and (o.unite_reference is null or l.unite_code = o.unite_reference)`
        : sql``}
      ${cond}`;
  const ids = lignes.map((r) => r.id as UUID);
  if (ids.length === 0) return { ids: [], lotId: nouveauLot() };
  const r = await sql.begin(async (tx) =>
    validerEnTransaction(tx as Tx, ids, o.action ?? "par_ouvrage", o),
  );
  await rafraichir(o);
  return r;
}

export async function devaliderRattachements(
  ids: UUID[],
  o: OptionsEcriture = {},
): Promise<number> {
  if (ids.length === 0) return 0;
  const n = await sql.begin(async (tx) => {
    const t = tx as Tx;
    const avant = (await snapshots(t, ids)).filter((s) => s.valide);
    if (avant.length === 0) return 0;
    const cibles = avant.map((s) => s.id);
    await t`update rattachements
      set valide = false, valide_par = null, valide_le = null
      where id = any(${cibles})`;
    await journaliser(
      t,
      nouveauLot(),
      "devalider",
      avant.map((s) => ({
        rattachementId: s.id,
        avant: s,
        apres: { valide: false, valide_par: null },
      })),
      o.acteur,
    );
    return cibles.length;
  });
  await rafraichir(o);
  return n;
}

/**
 * Annule le dernier geste non annulé : restaure l'état précédent de
 * chaque rattachement du lot ; supprime ceux qui n'existaient pas ;
 * désactive un ouvrage créé devenu orphelin ; réactive une source de
 * fusion.
 */
export async function annulerDerniereAction(
  o: OptionsEcriture = {},
): Promise<{ action: string; n: number } | null> {
  const resultat = await sql.begin(async (tx) => {
    const t = tx as Tx;
    const [dernier] = await t`
      select lot_id, action from calage_journal
      where annule_le is null
      order by created_at desc, id desc limit 1`;
    if (!dernier) return null;
    const lotId = dernier.lot_id as UUID;
    const entrees = await t`
      select id, rattachement_id, avant, ouvrage_cree_id, ouvrage_fusionne_id
      from calage_journal where lot_id = ${lotId} and annule_le is null`;

    let n = 0;
    for (const e of entrees) {
      const avant = e.avant as Snapshot | null;
      if (!e.rattachement_id) continue;
      if (avant === null) {
        await t`delete from rattachements where id = ${e.rattachement_id}`;
      } else {
        await t`update rattachements set
          ouvrage_id = ${avant.ouvrage_id},
          valide = ${avant.valide},
          methode = ${avant.methode},
          score = ${avant.score},
          valide_par = ${avant.valide_par},
          valide_le = ${avant.valide_le}
          where id = ${e.rattachement_id}`;
      }
      n++;
    }

    const crees = new Set(
      entrees.map((e) => e.ouvrage_cree_id as UUID | null).filter(Boolean),
    );
    for (const id of crees) {
      await t`update ouvrages set actif = false, updated_at = now()
        where id = ${id}
          and not exists (select 1 from rattachements where ouvrage_id = ${id})`;
    }
    const fusionnes = new Set(
      entrees.map((e) => e.ouvrage_fusionne_id as UUID | null).filter(Boolean),
    );
    for (const id of fusionnes) {
      await t`update ouvrages set actif = true, updated_at = now() where id = ${id}`;
      await t`update fusions_proposees
        set statut = 'proposee', decide_par = null, decide_le = null
        where source_id = ${id} and statut = 'acceptee'`;
    }

    await t`update calage_journal set annule_le = now() where lot_id = ${lotId}`;
    return { action: dernier.action as string, n };
  });
  if (resultat) await rafraichir(o);
  return resultat;
}

export async function dernierGesteAnnulable(): Promise<{
  action: string;
  n: number;
  quand: string;
} | null> {
  const [r] = await sql`
    select lot_id, action, count(*)::int as n, max(created_at)::text as quand
    from calage_journal
    where annule_le is null
    group by lot_id, action
    order by max(created_at) desc limit 1`;
  if (!r) return null;
  return { action: r.action as string, n: Number(r.n), quand: r.quand as string };
}

// ---------------------------------------------------------------------
// Création / rattachement manuel
// ---------------------------------------------------------------------

/** Rattache des lignes à un ouvrage et valide (upsert : fonctionne aussi
 *  pour une ligne sans aucun rattachement). Renvoie les ids créés/modifiés. */
export async function rattacherLignes(
  ligneIds: UUID[],
  ouvrageId: UUID,
  o: OptionsEcriture & { lotId?: UUID; action?: string; ouvrageCreeId?: UUID } = {},
): Promise<UUID[]> {
  if (ligneIds.length === 0) return [];
  const acteur = o.acteur ?? "calage";
  const ids = await sql.begin(async (tx) => {
    const t = tx as Tx;
    const existants = await t`
      select ${CHAMPS_SNAPSHOT}, r.ligne_source_id
      from rattachements r where r.ligne_source_id = any(${ligneIds})`;
    const avantParLigne = new Map<UUID, Snapshot>();
    for (const r of existants) {
      avantParLigne.set(r.ligne_source_id as UUID, {
        id: r.id as UUID,
        ouvrage_id: r.ouvrage_id as UUID,
        valide: Boolean(r.valide),
        methode: r.methode as string,
        score: r.score === null ? null : Number(r.score),
        valide_par: (r.valide_par as string) ?? null,
        valide_le: (r.valide_le as string) ?? null,
      });
    }
    const inseres = await t`
      insert into rattachements
        (ligne_source_id, ouvrage_id, score, methode, valide, valide_par, valide_le)
      select id, ${ouvrageId}, 1, 'manuel', true, ${acteur}, now()
      from unnest(${ligneIds}::uuid[]) as u(id)
      on conflict (ligne_source_id) do update set
        ouvrage_id = excluded.ouvrage_id,
        score = 1, methode = 'manuel', valide = true,
        valide_par = excluded.valide_par, valide_le = now()
      returning id, ligne_source_id`;
    await journaliser(
      t,
      o.lotId ?? nouveauLot(),
      o.action ?? "rattacher",
      inseres.map((r) => ({
        rattachementId: r.id as UUID,
        avant: avantParLigne.get(r.ligne_source_id as UUID) ?? null,
        apres: { ouvrage_id: ouvrageId, valide: true, valide_par: acteur },
        ouvrageCreeId: o.ouvrageCreeId ?? null,
      })),
      acteur,
    );
    return inseres.map((r) => r.id as UUID);
  });
  await rafraichir(o);
  return ids;
}

export async function creerOuvrageDepuisLigne(
  ligneId: UUID,
  ouvrage: Partial<Ouvrage>,
  o: OptionsEcriture & { lignesSupplementaires?: UUID[] } = {},
): Promise<Ouvrage & { rattachementIds: UUID[] }> {
  const [ligne] = await sql`
    select designation_brute, unite_code from lignes_source
    where id = ${ligneId}`;
  if (!ligne) throw new Error("Ligne source introuvable.");

  const libelleDevis =
    ouvrage.libelleDevis ?? (ligne.designation_brute as string);
  const libelleNormalise =
    ouvrage.libelleNormalise ??
    (ligne.designation_brute as string).toLowerCase();

  const [cree] = await sql`
    insert into ouvrages
      (lot_id, code, libelle_normalise, libelle_devis, unite_reference,
       est_forfaitaire, actif, valide_par, valide_le)
    values
      (${ouvrage.lotId ?? null}, ${ouvrage.code ?? null},
       ${libelleNormalise}, ${libelleDevis},
       ${ouvrage.unite ?? (ligne.unite_code as string) ?? null},
       ${ouvrage.estForfaitaire ?? false}, true, ${o.acteur ?? "calage"}, now())
    returning id`;

  const rattachementIds = await rattacherLignes(
    [ligneId, ...(o.lignesSupplementaires ?? [])],
    cree.id as UUID,
    { ...o, action: "creer", ouvrageCreeId: cree.id as UUID },
  );
  return { ...(await lireOuvrage(cree.id as UUID)), rattachementIds };
}

export async function modifierOuvrage(
  id: UUID,
  champs: Partial<Ouvrage>,
): Promise<Ouvrage> {
  await sql`update ouvrages set
    libelle_devis = coalesce(${champs.libelleDevis ?? null}, libelle_devis),
    libelle_normalise = coalesce(${champs.libelleNormalise ?? null}, libelle_normalise),
    lot_id = coalesce(${champs.lotId ?? null}, lot_id),
    code = coalesce(${champs.code ?? null}, code),
    unite_reference = coalesce(${champs.unite ?? null}, unite_reference),
    description_longue = coalesce(${champs.descriptionLongue ?? null}, description_longue),
    notes_specifiques = coalesce(${champs.notesSpecifiques ?? null}, notes_specifiques),
    est_forfaitaire = coalesce(${champs.estForfaitaire ?? null}, est_forfaitaire),
    actif = coalesce(${champs.actif ?? null}, actif),
    updated_at = now()
    where id = ${id}`;
  await sql`select rafraichir_agregats()`;
  return lireOuvrage(id);
}

/** Fusionne deux ouvrages : repointe les rattachements vers la cible,
 *  désactive la source (journalisé, annulable). */
export async function fusionnerOuvrages(
  sourceId: UUID,
  cibleId: UUID,
  o: OptionsEcriture = {},
): Promise<number> {
  if (sourceId === cibleId) {
    throw new Error("Impossible de fusionner un ouvrage avec lui-même.");
  }
  const n = await sql.begin(async (tx) => {
    const t = tx as Tx;
    const avant = await t`
      select ${CHAMPS_SNAPSHOT} from rattachements r where r.ouvrage_id = ${sourceId}`;
    await t`update rattachements set ouvrage_id = ${cibleId}
      where ouvrage_id = ${sourceId}`;
    await t`update ouvrages set actif = false, updated_at = now()
      where id = ${sourceId}`;
    const lotId = nouveauLot();
    const entrees = avant.map((r) => ({
      rattachementId: r.id as UUID,
      avant: {
        id: r.id as UUID,
        ouvrage_id: r.ouvrage_id as UUID,
        valide: Boolean(r.valide),
        methode: r.methode as string,
        score: r.score === null ? null : Number(r.score),
        valide_par: (r.valide_par as string) ?? null,
        valide_le: (r.valide_le as string) ?? null,
      },
      apres: { ouvrage_id: cibleId },
      ouvrageFusionneId: sourceId,
    }));
    if (entrees.length === 0) {
      // aucune ligne : on journalise tout de même la désactivation
      await t`insert into calage_journal
        (lot_id, action, ouvrage_fusionne_id, acteur)
        values (${lotId}, 'fusion', ${sourceId}, ${o.acteur ?? "calage"})`;
    } else {
      await journaliser(t, lotId, "fusion", entrees, o.acteur);
    }
    await t`update fusions_proposees
      set statut = 'obsolete'
      where statut = 'proposee'
        and (source_id = ${sourceId} or cible_id = ${sourceId})`;
    return avant.length;
  });
  await rafraichir(o);
  return n;
}

// ---------------------------------------------------------------------
// Auto-validation (propositions par règle, score élevé, unité concordante)
// ---------------------------------------------------------------------

export interface OptionsAutoValidation extends OptionsEcriture {
  seuil?: number;
  dryRun?: boolean;
}

export interface BilanAutoValidation {
  candidats: number;
  valides: number;
  lotId: UUID | null;
  parOuvrage: Array<{ ouvrageId: UUID; libelleDevis: string; n: number }>;
}

export async function autoValiderRattachements(
  o: OptionsAutoValidation = {},
): Promise<BilanAutoValidation> {
  const seuil = o.seuil ?? 0.8;
  const candidats = await sql`
    select r.id, r.ouvrage_id, o.libelle_devis
    from rattachements r
    join lignes_source l on l.id = r.ligne_source_id
    join documents d on d.id = l.document_id
    join ouvrages o on o.id = r.ouvrage_id
    where r.valide = false
      and r.methode = 'regle'
      and r.score >= ${seuil}
      and o.actif
      and d.statut <> 'rejete'
      and l.unite_code is not null
      and (o.unite_reference is null or o.unite_reference = l.unite_code)
    order by o.libelle_devis`;

  const parOuvrage = new Map<UUID, { libelleDevis: string; n: number }>();
  for (const c of candidats) {
    const e = parOuvrage.get(c.ouvrage_id as UUID) ?? {
      libelleDevis: c.libelle_devis as string,
      n: 0,
    };
    e.n++;
    parOuvrage.set(c.ouvrage_id as UUID, e);
  }
  const bilanOuvrages = [...parOuvrage.entries()]
    .map(([ouvrageId, v]) => ({ ouvrageId, ...v }))
    .sort((a, b) => b.n - a.n);

  if (o.dryRun || candidats.length === 0) {
    return { candidats: candidats.length, valides: 0, lotId: null, parOuvrage: bilanOuvrages };
  }
  const ids = candidats.map((c) => c.id as UUID);
  const r = await sql.begin(async (tx) =>
    validerEnTransaction(tx as Tx, ids, "auto", { ...o, acteur: o.acteur ?? "auto" }),
  );
  await rafraichir(o);
  return { candidats: candidats.length, valides: r.ids.length, lotId: r.lotId, parOuvrage: bilanOuvrages };
}

/** Ouvrages ayant des propositions en attente (pour la passe LLM). */
export async function ouvragesAValider(minAttente = 2): Promise<
  Array<{
    ouvrage: Ouvrage;
    lignes: Array<{
      rattachementId: UUID;
      designation: string;
      unite: string | null;
      pu: number | null;
      uniteCompatible: boolean;
    }>;
  }>
> {
  const lignes = await sql`
    select ${SELECT_OUVRAGE},
           r.id as rattachement_id, ls.designation_brute, ls.unite_code, ls.pu_ht,
           (o.unite_reference is null or o.unite_reference = ls.unite_code) as unite_ok,
           count(*) over (partition by o.id)::int as n_attente
    from rattachements r
    join lignes_source ls on ls.id = r.ligne_source_id
    join documents d on d.id = ls.document_id
    join ouvrages o on o.id = r.ouvrage_id
    left join lots l on l.id = o.lot_id
    where r.valide = false and o.actif and d.statut <> 'rejete'
    order by n_attente desc, o.id, ls.designation_brute`;
  const resultat: Array<{
    ouvrage: Ouvrage;
    lignes: Array<{
      rattachementId: UUID;
      designation: string;
      unite: string | null;
      pu: number | null;
      uniteCompatible: boolean;
    }>;
  }> = [];
  let courant: (typeof resultat)[number] | null = null;
  for (const r of lignes) {
    if (Number(r.n_attente) < minAttente) continue;
    if (!courant || courant.ouvrage.id !== r.id) {
      courant = { ouvrage: versOuvrage(r), lignes: [] };
      resultat.push(courant);
    }
    courant.lignes.push({
      rattachementId: r.rattachement_id as UUID,
      designation: r.designation_brute as string,
      unite: (r.unite_code as string) ?? null,
      pu: r.pu_ht === null ? null : Number(r.pu_ht),
      uniteCompatible: Boolean(r.unite_ok),
    });
  }
  return resultat;
}

// ---------------------------------------------------------------------
// Filtres de calage
// ---------------------------------------------------------------------

/** Un fragment sql est « thenable » : jamais retourné depuis une fonction
 *  async (il serait exécuté). D'où la séparation lots (async) / fragment. */
async function lotsPourFiltres(f?: FiltresCalage): Promise<UUID[] | null> {
  return f?.lotId ? idsLotAvecDescendants(f.lotId) : null;
}

function condFiltresCalage(
  f: FiltresCalage | undefined,
  lotIds: UUID[] | null,
  aliasLignes = "l",
) {
  if (!f) return sql``;
  const terme = f.recherche?.trim();
  const col = sql(aliasLignes + ".designation_recherche");
  return sql`
    ${lotIds ? sql`and o.lot_id = any(${lotIds})` : sql``}
    ${f.methode === "auto"
      ? sql`and r.valide_par in ('auto', 'auto-llm')`
      : f.methode
        ? sql`and r.methode = ${f.methode}`
        : sql``}
    ${f.statutDoc ? sql`and d.statut = ${f.statutDoc}` : sql``}
    ${terme
      ? sql`and (${col} like '%' || f_unaccent(lower(${terme})) || '%'
                 or f_unaccent(lower(o.libelle_devis)) like '%' || f_unaccent(lower(${terme})) || '%'
                 or o.libelle_normalise like '%' || f_unaccent(lower(${terme})) || '%')`
      : sql``}
  `;
}

const SELECT_LIGNE_CALAGE = sql`
  l.id, l.document_id, l.ordre, l.designation_brute, l.unite_brute,
  l.quantite, l.pu_ht, l.total_ht, l.unite_code, l.attributs,
  l.est_forfait, l.controle_ligne,
  d.date_document::text as date_document, d.numero_document,
  c.nom_normalise as client_nom, d.chantier_objet,
  z.code as zone_code, d.zone_fiable, d.est_ts, d.storage_path,
  d.statut as statut_document
`;

function versLigneCalage(r: Record<string, unknown>): LigneCalage {
  return {
    ...versLigneContexte(r),
    rattachementId: (r.rattachement_id as UUID) ?? null,
    score: r.score === null || r.score === undefined ? null : Number(r.score),
    methode: (r.methode as MethodeRattachement) ?? null,
    validePar: (r.valide_par as string) ?? null,
    statutDocument: r.statut_document as StatutDocument,
    controleLigne: (r.controle_ligne as ControleLigne) ?? "non_verifie",
    nbIdentiques:
      r.nb_identiques === undefined ? undefined : Number(r.nb_identiques),
  };
}

// ---------------------------------------------------------------------
// File ligne à ligne
// ---------------------------------------------------------------------

export async function rattachementsAValider(
  page: number,
  filtres?: FiltresCalage,
): Promise<Page<RattachementAValider>> {
  const parPage = 20;
  const cond = condFiltresCalage(filtres, await lotsPourFiltres(filtres));
  const lignes = await sql`
    select r.id as rattachement_id, r.score, r.methode, r.exclu_agregats,
           r.motif_exclusion,
           ${SELECT_LIGNE_CALAGE},
           o.id as o_id, o.code as o_code, o.lot_id as o_lot_id,
           lo.code as o_lot_code, lo.libelle as o_lot_libelle,
           o.libelle_devis as o_libelle_devis,
           o.libelle_normalise as o_libelle_normalise,
           o.description_longue as o_description_longue,
           o.notes_specifiques as o_notes_specifiques,
           o.unite_reference as o_unite_reference,
           o.est_forfaitaire as o_est_forfaitaire, o.actif as o_actif,
           count(*) over (partition by r.ouvrage_id)::int as nb_meme_ouvrage,
           count(*) over ()::int as total_compte
    from rattachements r
    join lignes_source l on l.id = r.ligne_source_id
    join documents d on d.id = l.document_id
    left join clients c on c.id = d.client_id
    left join zones z on z.id = d.zone_id
    join ouvrages o on o.id = r.ouvrage_id
    left join lots lo on lo.id = o.lot_id
    where r.valide = false and d.statut <> 'rejete'
    ${cond}
    order by nb_meme_ouvrage desc, r.ouvrage_id, r.score asc nulls first, d.date_document
    limit ${parPage} offset ${(page - 1) * parPage}
  `;

  const resultats: RattachementAValider[] = [];
  for (const r of lignes) {
    const candidats = await sql`
      select ${SELECT_OUVRAGE},
             similarity(o.libelle_normalise,
                        f_unaccent(lower(${r.designation_brute as string}))) as score
      from ouvrages o
      left join lots l on l.id = o.lot_id
      where o.actif = true and o.id <> ${r.o_id as string}
      order by score desc
      limit 3`;

    resultats.push({
      id: r.rattachement_id as UUID,
      ligne: versLigneContexte(r),
      ouvragePropose: {
        id: r.o_id as UUID,
        code: (r.o_code as string) ?? null,
        lotId: (r.o_lot_id as UUID) ?? null,
        lotCode: (r.o_lot_code as string) ?? null,
        lotLibelle: (r.o_lot_libelle as string) ?? null,
        libelleDevis: r.o_libelle_devis as string,
        libelleNormalise: r.o_libelle_normalise as string,
        descriptionLongue: (r.o_description_longue as string) ?? null,
        notesSpecifiques: (r.o_notes_specifiques as string) ?? null,
        unite: (r.o_unite_reference as CodeUnite) ?? null,
        estForfaitaire: Boolean(r.o_est_forfaitaire),
        actif: Boolean(r.o_actif),
      },
      score: r.score === null ? null : Number(r.score),
      methode: r.methode as MethodeRattachement,
      candidats: candidats.map((c) => ({
        ouvrage: versOuvrage(c),
        score: Math.round(Number(c.score) * 1000) / 1000,
      })),
      statutDocument: r.statut_document as StatutDocument,
      controleLigne: (r.controle_ligne as ControleLigne) ?? "non_verifie",
      nbMemeOuvrage: Number(r.nb_meme_ouvrage) - 1,
    });
  }

  return {
    lignes: resultats,
    total: lignes.length > 0 ? Number(lignes[0].total_compte) : 0,
    page,
    parPage,
    totalApproche: false,
  };
}

// ---------------------------------------------------------------------
// File par ouvrage
// ---------------------------------------------------------------------

export async function rattachementsParOuvrage(
  filtres: FiltresCalage | undefined,
  page: number,
  parPage = 10,
  lignesMax = 60,
): Promise<Page<GroupeCalage>> {
  const lotIds = await lotsPourFiltres(filtres);
  const cond = condFiltresCalage(filtres, lotIds);
  // alias « l » = lots (SELECT_OUVRAGE), « ls » = lignes source
  const groupes = await sql`
    select ${SELECT_OUVRAGE},
           count(*) filter (where not r.valide)::int as en_attente,
           (select count(*)::int from rattachements rv where rv.ouvrage_id = o.id and rv.valide) as validees,
           (select count(*)::int from rattachements rv where rv.ouvrage_id = o.id and rv.valide
              and rv.valide_par in ('auto', 'auto-llm')) as auto,
           (array_agg(distinct ls.designation_brute))[1:3] as echantillon,
           count(*) over ()::int as total_compte
    from rattachements r
    join lignes_source ls on ls.id = r.ligne_source_id
    join documents d on d.id = ls.document_id
    join ouvrages o on o.id = r.ouvrage_id
    left join lots l on l.id = o.lot_id
    where r.valide = false and d.statut <> 'rejete' and o.actif
    ${condFiltresCalage(filtres, lotIds, "ls")}
    group by o.id, l.code, l.libelle
    order by en_attente desc, o.libelle_devis
    limit ${parPage} offset ${(page - 1) * parPage}
  `;

  if (groupes.length === 0) {
    return { lignes: [], total: 0, page, parPage, totalApproche: false };
  }
  const ids = groupes.map((g) => g.id as UUID);
  const lignes = await sql`
    select r.id as rattachement_id, r.score, r.methode, r.valide_par,
           r.exclu_agregats, r.motif_exclusion, r.ouvrage_id,
           ${SELECT_LIGNE_CALAGE}
    from rattachements r
    join lignes_source l on l.id = r.ligne_source_id
    join documents d on d.id = l.document_id
    join ouvrages o on o.id = r.ouvrage_id
    left join clients c on c.id = d.client_id
    left join zones z on z.id = d.zone_id
    where r.ouvrage_id = any(${ids}) and r.valide = false and d.statut <> 'rejete'
    ${cond}
    order by r.ouvrage_id, d.date_document desc nulls last, l.ordre`;

  const parOuvrage = new Map<UUID, LigneCalage[]>();
  for (const r of lignes) {
    const liste = parOuvrage.get(r.ouvrage_id as UUID) ?? [];
    liste.push(versLigneCalage(r));
    parOuvrage.set(r.ouvrage_id as UUID, liste);
  }

  return {
    lignes: groupes.map((g) => {
      const liste = parOuvrage.get(g.id as UUID) ?? [];
      return {
        ouvrage: versOuvrage(g),
        nbEnAttente: Number(g.en_attente),
        nbValidees: Number(g.validees),
        nbAuto: Number(g.auto),
        echantillon: (g.echantillon as string[]) ?? [],
        lignes: liste.slice(0, lignesMax),
        lignesTronquees: liste.length > lignesMax,
      };
    }),
    total: Number(groupes[0].total_compte),
    page,
    parPage,
    totalApproche: false,
  };
}

// ---------------------------------------------------------------------
// File sans ouvrage
// ---------------------------------------------------------------------

export async function lignesSansOuvrage(
  filtres: FiltresCalage | undefined,
  page: number,
  parPage = 50,
): Promise<Page<LigneCalage>> {
  const terme = filtres?.recherche?.trim();
  const lignes = await sql`
    select ${SELECT_LIGNE_CALAGE},
           null::uuid as rattachement_id, null::numeric as score,
           null::text as methode, null::text as valide_par,
           false as exclu_agregats, null::text as motif_exclusion,
           count(*) over (partition by l.designation_recherche)::int as nb_identiques,
           count(*) over ()::int as total_compte
    from lignes_source l
    join documents d on d.id = l.document_id
    left join clients c on c.id = d.client_id
    left join zones z on z.id = d.zone_id
    left join rattachements r on r.ligne_source_id = l.id
    where r.id is null
      and l.est_titre = false
      and l.hors_perimetre = false
      and l.pu_ht > 0
      and d.statut <> 'rejete'
      ${filtres?.statutDoc ? sql`and d.statut = ${filtres.statutDoc}` : sql``}
      ${terme ? sql`and l.designation_recherche like '%' || f_unaccent(lower(${terme})) || '%'` : sql``}
    order by nb_identiques desc, l.designation_recherche, d.date_document desc nulls last
    limit ${parPage} offset ${(page - 1) * parPage}`;
  return {
    lignes: lignes.map(versLigneCalage),
    total: lignes.length > 0 ? Number(lignes[0].total_compte) : 0,
    page,
    parPage,
    totalApproche: false,
  };
}

/** Ids des lignes sans ouvrage ayant la même désignation normalisée. */
export async function lignesIdentiquesSansOuvrage(ligneId: UUID): Promise<UUID[]> {
  const lignes = await sql`
    select l2.id
    from lignes_source l1
    join lignes_source l2 on l2.designation_recherche = l1.designation_recherche
    left join rattachements r on r.ligne_source_id = l2.id
    where l1.id = ${ligneId} and r.id is null
      and l2.est_titre = false and l2.pu_ht > 0`;
  return lignes.map((r) => r.id as UUID);
}

// ---------------------------------------------------------------------
// Documents à revoir
// ---------------------------------------------------------------------

export async function documentsARevoir(): Promise<DocumentARevoir[]> {
  const docs = await sql`
    select d.id, d.numero_document, d.fichier_nom,
           d.date_document::text as date_document,
           c.nom_normalise as client_nom, d.chantier_objet, d.est_ts,
           d.statut, d.total_ht, d.ecart_total, d.controle_total, d.storage_path,
           (select count(*)::int from lignes_source l
             where l.document_id = d.id and l.est_titre = false) as nb_lignes,
           (select count(*)::int from lignes_source l
             where l.document_id = d.id and l.controle_ligne = 'ecart') as nb_ecart
    from documents d
    left join clients c on c.id = d.client_id
    where d.statut = 'a_revoir'
    order by d.date_document desc nulls last, d.created_at desc`;
  if (docs.length === 0) return [];

  const ids = docs.map((d) => d.id as string);
  const lignes = await sql`
    select l.id, l.document_id, l.designation_brute, l.quantite, l.pu_ht,
           l.total_ht, l.ecart
    from lignes_source l
    where l.document_id = any(${ids})
      and l.est_titre = false
      and l.controle_ligne = 'ecart'
    order by l.ordre`;

  return docs.map((d) => ({
    id: d.id as UUID,
    numero: (d.numero_document as string) ?? null,
    fichierNom: d.fichier_nom as string,
    date: (d.date_document as string) ?? null,
    client: (d.client_nom as string) ?? null,
    chantierObjet: (d.chantier_objet as string) ?? null,
    estTs: Boolean(d.est_ts),
    statut: d.statut as StatutDocument,
    totalHt: d.total_ht === null ? null : Number(d.total_ht),
    ecartTotal: d.ecart_total === null ? null : Number(d.ecart_total),
    controleTotal: d.controle_total as DocumentARevoir["controleTotal"],
    nbLignes: Number(d.nb_lignes),
    nbLignesEcart: Number(d.nb_ecart),
    lienPdf: d.storage_path ? `/api/documents/${d.id as string}/fichier` : null,
    lignesEnEcart: lignes
      .filter((l) => l.document_id === d.id)
      .map((l) => ({
        id: l.id as UUID,
        designation: l.designation_brute as string,
        quantite: l.quantite === null ? null : Number(l.quantite),
        pu: l.pu_ht === null ? null : Number(l.pu_ht),
        total: l.total_ht === null ? null : Number(l.total_ht),
        ecart: l.ecart === null ? null : Number(l.ecart),
      })),
  }));
}

export async function changerStatutDocument(
  id: UUID,
  statut: "valide" | "rejete" | "a_revoir",
  o: OptionsEcriture & { motif?: string } = {},
): Promise<void> {
  await sql`update documents set
    statut = ${statut},
    revu_par = ${o.acteur ?? "calage"},
    revu_le = now(),
    motif_revue = ${o.motif ?? null},
    updated_at = now()
    where id = ${id}`;
  await rafraichir(o);
}

export async function modifierDocument(
  id: UUID,
  champs: { estTs?: boolean },
  o: OptionsEcriture = {},
): Promise<void> {
  await sql`update documents set
    est_ts = coalesce(${champs.estTs ?? null}, est_ts),
    updated_at = now()
    where id = ${id}`;
  await rafraichir(o);
}

// ---------------------------------------------------------------------
// Propositions de fusion (quasi-doublons du référentiel)
// ---------------------------------------------------------------------

/** Paires d'ouvrages actifs proches par trigramme, même unité et même
 *  nature (forfaitaire ou non). Cible = le plus rattaché. Renvoie le
 *  nombre de nouvelles propositions. */
export async function genererPropositionsFusion(
  o: { seuil?: number } = {},
): Promise<number> {
  const seuil = o.seuil ?? 0.6;
  const inseres = await sql`
    with n as (
      select ouvrage_id, count(*) as n from rattachements group by 1
    ),
    paires as (
      select a.id as a_id, b.id as b_id,
             coalesce(na.n, 0) as na, coalesce(nb.n, 0) as nb,
             a.created_at as ca, b.created_at as cb,
             similarity(a.libelle_normalise, b.libelle_normalise) as score,
             a.lot_id as lot_a, b.lot_id as lot_b
      from ouvrages a
      join ouvrages b on a.id < b.id
      left join n na on na.ouvrage_id = a.id
      left join n nb on nb.ouvrage_id = b.id
      where a.actif and b.actif
        and a.est_forfaitaire = b.est_forfaitaire
        and a.unite_reference is not distinct from b.unite_reference
        and similarity(a.libelle_normalise, b.libelle_normalise) >= ${seuil}
    )
    insert into fusions_proposees (source_id, cible_id, score, methode, motif)
    select case when (na, ca) >= (nb, cb) then b_id else a_id end,
           case when (na, ca) >= (nb, cb) then a_id else b_id end,
           round(score::numeric, 3), 'trigramme',
           'similarité ' || round(score::numeric, 2)
             || case when lot_a is distinct from lot_b then ' · lots différents' else '' end
    from paires
    on conflict do nothing
    returning id`;
  return inseres.length;
}

const SELECT_FUSION = sql`
  f.id, f.score, f.methode, f.avis_llm, f.motif, f.statut,
  s.id as s_id, s.code as s_code, s.lot_id as s_lot_id, ls.code as s_lot_code,
  ls.libelle as s_lot_libelle, s.libelle_devis as s_libelle_devis,
  s.libelle_normalise as s_libelle_normalise, s.unite_reference as s_unite,
  s.est_forfaitaire as s_forfait, s.actif as s_actif,
  (select count(*)::int from rattachements r where r.ouvrage_id = s.id) as s_n,
  c.id as c_id, c.code as c_code, c.lot_id as c_lot_id, lc.code as c_lot_code,
  lc.libelle as c_lot_libelle, c.libelle_devis as c_libelle_devis,
  c.libelle_normalise as c_libelle_normalise, c.unite_reference as c_unite,
  c.est_forfaitaire as c_forfait, c.actif as c_actif,
  (select count(*)::int from rattachements r where r.ouvrage_id = c.id) as c_n
`;

function versFusion(r: Record<string, unknown>): FusionProposee {
  const cote = (p: "s" | "c"): Ouvrage & { nbLignes: number } => ({
    id: r[`${p}_id`] as UUID,
    code: (r[`${p}_code`] as string) ?? null,
    lotId: (r[`${p}_lot_id`] as UUID) ?? null,
    lotCode: (r[`${p}_lot_code`] as string) ?? null,
    lotLibelle: (r[`${p}_lot_libelle`] as string) ?? null,
    libelleDevis: r[`${p}_libelle_devis`] as string,
    libelleNormalise: r[`${p}_libelle_normalise`] as string,
    descriptionLongue: null,
    notesSpecifiques: null,
    unite: (r[`${p}_unite`] as CodeUnite) ?? null,
    estForfaitaire: Boolean(r[`${p}_forfait`]),
    actif: Boolean(r[`${p}_actif`]),
    nbLignes: Number(r[`${p}_n`]),
  });
  return {
    id: r.id as UUID,
    source: cote("s"),
    cible: cote("c"),
    score: r.score === null ? null : Number(r.score),
    methode: r.methode as "trigramme" | "llm",
    avisLlm: (r.avis_llm as FusionProposee["avisLlm"]) ?? null,
    motif: (r.motif as string) ?? null,
  };
}

export async function listerFusionsProposees(
  statut: "proposee" | "acceptee" | "refusee" = "proposee",
  limite = 200,
): Promise<FusionProposee[]> {
  const lignes = await sql`
    select ${SELECT_FUSION}
    from fusions_proposees f
    join ouvrages s on s.id = f.source_id
    left join lots ls on ls.id = s.lot_id
    join ouvrages c on c.id = f.cible_id
    left join lots lc on lc.id = c.lot_id
    where f.statut = ${statut}
      ${statut === "proposee" ? sql`and s.actif and c.actif` : sql``}
    order by f.score desc nulls last, s.libelle_devis
    limit ${limite}`;
  return lignes.map(versFusion);
}

/** Enregistre l'avis du LLM sur une proposition ; « distinct » la refuse. */
export async function qualifierFusion(
  id: UUID,
  avis: "meme" | "distinct" | "incertain",
  motif: string | null,
): Promise<void> {
  await sql`update fusions_proposees set
    avis_llm = ${avis}, motif = coalesce(${motif}, motif), methode = 'llm',
    statut = case when ${avis} = 'distinct' then 'refusee' else statut end,
    decide_par = case when ${avis} = 'distinct' then 'llm' else decide_par end,
    decide_le = case when ${avis} = 'distinct' then now() else decide_le end
    where id = ${id} and statut = 'proposee'`;
}

export async function accepterFusion(
  id: UUID,
  o: OptionsEcriture & { inverser?: boolean } = {},
): Promise<void> {
  const [f] = await sql`
    select source_id, cible_id from fusions_proposees
    where id = ${id} and statut = 'proposee'`;
  if (!f) throw new Error("Proposition introuvable ou déjà traitée.");
  const source = (o.inverser ? f.cible_id : f.source_id) as UUID;
  const cible = (o.inverser ? f.source_id : f.cible_id) as UUID;
  if (o.inverser) {
    await sql`update fusions_proposees
      set source_id = ${source}, cible_id = ${cible} where id = ${id}`;
  }
  await fusionnerOuvrages(source, cible, o);
  await sql`update fusions_proposees
    set statut = 'acceptee', decide_par = ${o.acteur ?? "calage"}, decide_le = now()
    where id = ${id}`;
}

export async function refuserFusion(
  id: UUID,
  o: OptionsEcriture = {},
): Promise<void> {
  await sql`update fusions_proposees
    set statut = 'refusee', decide_par = ${o.acteur ?? "calage"}, decide_le = now()
    where id = ${id} and statut = 'proposee'`;
}

// ---------------------------------------------------------------------
// Progression, lots, synthèse
// ---------------------------------------------------------------------

/** Lots aplatis (pour les sélecteurs du calage). */
export async function lotsAPlat(): Promise<
  Array<{ id: UUID; code: string; libelle: string }>
> {
  const lots = await sql`
    select id, code, libelle from lots order by code`;
  return lots.map((l) => ({
    id: l.id as UUID,
    code: l.code as string,
    libelle: l.libelle as string,
  }));
}

export async function progression(): Promise<ProgressionCalage> {
  const [r] = await sql`
    select
      (select count(*)::int from lignes_source where est_titre = false) as lignes_total,
      (select count(*)::int from rattachements where valide = true) as lignes_validees,
      (select count(*)::int from rattachements where valide = true
         and valide_par in ('auto', 'auto-llm')) as validees_auto,
      (select count(*)::int from documents where statut = 'a_revoir') as documents_a_revoir,
      (select count(*)::int from ouvrages o
        where o.actif = true and not exists (
          select 1 from rattachements r
          where r.ouvrage_id = o.id and r.valide = true)) as ouvrages_sans_validation,
      (select count(*)::int from rattachements r
         join lignes_source l on l.id = r.ligne_source_id
         join documents d on d.id = l.document_id
         where r.valide = false and d.statut <> 'rejete') as en_attente,
      (select count(*)::int from lignes_source l
         join documents d on d.id = l.document_id
         left join rattachements r on r.ligne_source_id = l.id
         where r.id is null and l.est_titre = false and l.hors_perimetre = false
           and l.pu_ht > 0 and d.statut <> 'rejete') as sans_ouvrage,
      (select count(*)::int from fusions_proposees f
         join ouvrages s on s.id = f.source_id
         join ouvrages c on c.id = f.cible_id
         where f.statut = 'proposee' and s.actif and c.actif) as doublons
  `;
  return {
    lignesTotal: Number(r.lignes_total),
    lignesValidees: Number(r.lignes_validees),
    documentsARevoir: Number(r.documents_a_revoir),
    ouvragesSansValidation: Number(r.ouvrages_sans_validation),
    rattachementsEnAttente: Number(r.en_attente),
    lignesSansOuvrage: Number(r.sans_ouvrage),
    doublonsProposes: Number(r.doublons),
    valideesAuto: Number(r.validees_auto),
  };
}

export async function synthese(): Promise<SyntheseBase> {
  const [r] = await sql`
    select
      (select count(*)::int from ouvrages where actif = true) as nb_ouvrages,
      (select count(distinct ouvrage_id)::int from v_lignes_agregables) as nb_avec_prix,
      (select count(*)::int from lots where parent_id is null) as nb_lots,
      (select count(*)::int from zones) as nb_zones,
      (select count(*)::int from documents where statut <> 'rejete') as nb_documents,
      (select count(*)::int from lignes_source l join documents d on d.id = l.document_id
         where l.est_titre = false and d.statut <> 'rejete') as nb_lignes,
      (select count(distinct client_id)::int from documents
        where client_id is not null) as nb_clients,
      (select min(date_document)::text from documents) as premiere_date,
      (select max(date_document)::text from documents) as derniere_date,
      (select max(created_at)::text from documents) as derniere_ecriture
  `;
  return {
    nbOuvrages: Number(r.nb_ouvrages),
    nbOuvragesAvecPrix: Number(r.nb_avec_prix),
    nbLots: Number(r.nb_lots),
    nbZones: Number(r.nb_zones),
    nbDocuments: Number(r.nb_documents),
    nbLignes: Number(r.nb_lignes),
    nbClients: Number(r.nb_clients),
    premiereDate: (r.premiere_date as string | null) ?? null,
    derniereDate: (r.derniere_date as string | null) ?? null,
    derniereEcriture: (r.derniere_ecriture as string | null) ?? null,
  };
}
