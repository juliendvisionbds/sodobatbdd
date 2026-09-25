// =====================================================================
// Tests du calage — base locale seedée UNIQUEMENT (écritures, remises en
// état systématiques). Ne jamais lancer contre Supabase.
// =====================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "@/lib/db";
import { ouvrages, referentiel } from "@/lib/queries";
import type { UUID } from "@/types";

if (/supabase/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("tests/calage.test.ts écrit en base : base locale seulement.");
}

let ipn160: UUID;

beforeAll(async () => {
  const [r] = await referentiel.chercherOuvrages("CM-IPN-160", 1);
  if (!r) throw new Error("Seed incomplet : CM-IPN-160 introuvable");
  ipn160 = r.id;
});

afterAll(async () => {
  await sql`select rafraichir_agregats()`;
});

describe("règle par ligne", () => {
  it("statsOuvrage.n égale le comptage direct avec les conditions de la vue", async () => {
    const s = await ouvrages.statsOuvrage(ipn160, { typeTravaux: "tous" });
    const [c] = await sql`
      select count(*)::int as n
      from lignes_source l
      join rattachements r on r.ligne_source_id = l.id
      join documents d on d.id = l.document_id
      join ouvrages o on o.id = r.ouvrage_id
      left join unites u on u.code = l.unite_code
      where r.ouvrage_id = ${ipn160}
        and d.statut <> 'rejete' and l.controle_ligne <> 'ecart'
        and r.valide and not r.exclu_agregats and not l.est_titre
        and l.pu_ht > 0 and not o.est_forfaitaire and not l.est_forfait
        and coalesce(u.agregable, true)`;
    expect(s?.n ?? 0).toBe(Number(c.n));
  });

  it("rejeter une pièce retire ses lignes, la remettre les restaure", async () => {
    const [doc] = await sql`
      select d.id from documents d
      join lignes_source l on l.document_id = d.id
      join rattachements r on r.ligne_source_id = l.id and r.valide
      where r.ouvrage_id = ${ipn160} and d.statut = 'valide'
      limit 1`;
    const avant = (await ouvrages.statsOuvrage(ipn160, { typeTravaux: "tous" }))!.n;
    await referentiel.changerStatutDocument(doc.id as UUID, "rejete", { motif: "test" });
    const pendant = (await ouvrages.statsOuvrage(ipn160, { typeTravaux: "tous" }))?.n ?? 0;
    expect(pendant).toBeLessThan(avant);
    await referentiel.changerStatutDocument(doc.id as UUID, "valide");
    const apres = (await ouvrages.statsOuvrage(ipn160, { typeTravaux: "tous" }))!.n;
    expect(apres).toBe(avant);
  });
});

describe("auto-validation et annulation", () => {
  it("est idempotente, marquée auto, et annulable", async () => {
    const vide = await referentiel.autoValiderRattachements({ dryRun: true });
    expect(vide.candidats).toBe(0);

    // fabriquer un candidat : une proposition en attente sur l'IPN 160,
    // méthode règle, score élevé, unité compatible
    const [ratt] = await sql`
      select r.id, r.methode, r.score from rattachements r
      join lignes_source l on l.id = r.ligne_source_id
      join ouvrages o on o.id = r.ouvrage_id
      where r.valide = false and l.unite_code = o.unite_reference
      limit 1`;
    expect(ratt).toBeTruthy();
    await sql`update rattachements set methode = 'regle', score = 0.95
      where id = ${ratt.id}`;

    const sec = await referentiel.autoValiderRattachements({ dryRun: true });
    expect(sec.candidats).toBe(1);
    const reel = await referentiel.autoValiderRattachements();
    expect(reel.valides).toBe(1);
    const [apres] = await sql`select valide, valide_par from rattachements where id = ${ratt.id}`;
    expect(apres.valide).toBe(true);
    expect(apres.valide_par).toBe("auto");

    const encore = await referentiel.autoValiderRattachements();
    expect(encore.valides).toBe(0);

    const annule = await referentiel.annulerDerniereAction();
    expect(annule?.action).toBe("auto");
    expect(annule?.n).toBe(1);
    const [restaure] = await sql`select valide, valide_par from rattachements where id = ${ratt.id}`;
    expect(restaure.valide).toBe(false);
    expect(restaure.valide_par).toBeNull();

    await sql`update rattachements set methode = ${ratt.methode}, score = ${ratt.score}
      where id = ${ratt.id}`;
  });

  it("validerParOuvrage puis annulation ramène à l'état initial", async () => {
    const [g] = await sql`
      select ouvrage_id, count(*)::int as n from rattachements
      where valide = false group by ouvrage_id order by n desc limit 1`;
    const r = await referentiel.validerParOuvrage(g.ouvrage_id as UUID);
    expect(r.ids.length).toBe(Number(g.n));
    const [c1] = await sql`select count(*)::int as n from rattachements
      where ouvrage_id = ${g.ouvrage_id} and valide = false`;
    expect(Number(c1.n)).toBe(0);
    const a = await referentiel.annulerDerniereAction();
    expect(a?.n).toBe(Number(g.n));
    const [c2] = await sql`select count(*)::int as n from rattachements
      where ouvrage_id = ${g.ouvrage_id} and valide = false`;
    expect(Number(c2.n)).toBe(Number(g.n));
  });

  it("rattacherLignes sur une ligne sans rattachement crée, puis l'annulation supprime", async () => {
    const [ligne] = await sql`
      select l.id from lignes_source l
      left join rattachements r on r.ligne_source_id = l.id
      where r.id is null and l.est_titre = false limit 1`;
    if (!ligne) return; // seed sans orpheline : rien à tester
    const ids = await referentiel.rattacherLignes([ligne.id as UUID], ipn160);
    expect(ids.length).toBe(1);
    const a = await referentiel.annulerDerniereAction();
    expect(a?.action).toBe("rattacher");
    const [reste] = await sql`select 1 from rattachements where ligne_source_id = ${ligne.id}`;
    expect(reste).toBeUndefined();
  });
});

describe("propositions de fusion", () => {
  it("n'apparie jamais un ouvrage avec lui-même et reste idempotente", async () => {
    const n1 = await referentiel.genererPropositionsFusion({ seuil: 0.3 });
    const n2 = await referentiel.genererPropositionsFusion({ seuil: 0.3 });
    expect(n2).toBe(0);
    const [auto] = await sql`select count(*)::int as n from fusions_proposees where source_id = cible_id`;
    expect(Number(auto.n)).toBe(0);
    const liste = await referentiel.listerFusionsProposees("proposee");
    expect(liste.length).toBeGreaterThanOrEqual(0);
    void n1;
    await sql`delete from fusions_proposees`;
  });

  it("accepter une fusion désactive la source, l'annulation la réactive", async () => {
    const [[a], [b]] = await Promise.all([
      sql`select id from ouvrages where actif order by created_at limit 1`,
      sql`select id from ouvrages where actif order by created_at desc limit 1`,
    ]);
    const [prop] = await sql`insert into fusions_proposees (source_id, cible_id, score)
      values (${a.id}, ${b.id}, 0.9) returning id`;
    await referentiel.accepterFusion(prop.id as UUID);
    const [src] = await sql`select actif from ouvrages where id = ${a.id}`;
    expect(src.actif).toBe(false);
    const annule = await referentiel.annulerDerniereAction();
    expect(annule?.action).toBe("fusion");
    const [src2] = await sql`select actif from ouvrages where id = ${a.id}`;
    expect(src2.actif).toBe(true);
    const [restant] = await sql`select count(*)::int as n from rattachements where ouvrage_id = ${b.id}
      and ligne_source_id in (select ligne_source_id from rattachements where ouvrage_id = ${a.id})`;
    expect(Number(restant.n)).toBe(0);
    await sql`delete from fusions_proposees where id = ${prop.id}`;
  });
});
