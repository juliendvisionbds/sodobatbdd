// =====================================================================
// SODOBAT — 09_tests_queries.test.ts
//
// Vitest, exécuté sur le jeu de démonstration (seed déterministe).
//
// Ces tests ne couvrent pas l'interface : ils couvrent la seule classe de
// bugs qu'aucune relecture visuelle n'attrape — un agrégat faux mais
// plausible. Un mauvais filtre sur `niveau` ne casse rien à l'écran : il
// affiche 163,20 € au lieu de 147,00 €, et personne ne le voit avant que
// Sodobat perde un chantier dessus.
//
// À faire tourner avant chaque livraison.
// =====================================================================

import { describe, it, expect, beforeAll } from "vitest";
import { ouvrages, historique, referentiel } from "@/lib/queries";
import type { StatsPrix, UUID } from "@/types";

let ipn160: UUID;
let bicouche: UUID;
let corniche: UUID;   // n = 1
let etudeBeton: UUID; // forfaitaire

beforeAll(async () => {
  const parCode = async (code: string) => {
    const r = await referentiel.chercherOuvrages(code, 1);
    if (!r[0]) throw new Error(`Seed incomplet : ${code} introuvable`);
    return r[0].id;
  };
  ipn160     = await parCode("CM-IPN-160");
  bicouche   = await parCode("ET-BIC-AUT");
  corniche   = await parCode("RA-COR-MOU");
  etudeBeton = await parCode("FC-ETU-BET");
});

// ---------------------------------------------------------------------
// 1. Le piège des niveaux d'agrégation
// ---------------------------------------------------------------------

describe("niveaux de mv_stats_ouvrage", () => {
  it("le niveau global ne double aucune ligne", async () => {
    const global = await ouvrages.statsOuvrage(ipn160, { typeTravaux: "tous" });
    const normaux = await ouvrages.statsOuvrage(ipn160, { typeTravaux: "normaux" });
    const ts = await ouvrages.statsOuvrage(ipn160, { typeTravaux: "ts" });

    expect(global!.niveau).toBe("global");
    expect(normaux!.niveau).toBe("type");
    // Si le filtre sur `niveau` manque, global compte deux à trois fois
    // les mêmes lignes et ce test tombe.
    expect(global!.n).toBe(normaux!.n + ts!.n);
  });

  it("la somme des zones ne dépasse pas le total du type", async () => {
    const normaux = await ouvrages.statsOuvrage(ipn160, { typeTravaux: "normaux" });
    const zones = await ouvrages.statsParZone(ipn160, { typeTravaux: "normaux" });
    const somme = zones.reduce((s, z) => s + (z.stats?.n ?? 0), 0);
    expect(somme).toBe(normaux!.n);
  });

  it("les 4 zones sont toujours retournées, même vides", async () => {
    const zones = await ouvrages.statsParZone(corniche);
    expect(zones).toHaveLength(4);
    expect(zones.filter((z) => z.stats === null).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------
// 2. Indexation
// ---------------------------------------------------------------------

describe("prix actualisés", () => {
  it("l'indexé diffère du brut et lui est supérieur", async () => {
    const s = (await ouvrages.statsOuvrage(bicouche))!;
    // Le seed applique 4 %/an sur 2024-2026 : l'écart doit être visible.
    expect(s.medianeIndexee).toBeGreaterThan(s.mediane);
    expect(s.medianeIndexee / s.mediane).toBeGreaterThan(1.01);
  });

  it("les deux jeux de valeurs sont présents dans le même objet", async () => {
    const s = (await ouvrages.statsOuvrage(bicouche))!;
    // La bascule de l'interface ne doit jamais déclencher de requête.
    for (const c of ["min", "max", "mediane", "minIndexe", "maxIndexe", "medianeIndexee"] as const) {
      expect(typeof s[c]).toBe("number");
    }
  });
});

// ---------------------------------------------------------------------
// 3. Cohérence statistique
// ---------------------------------------------------------------------

describe("cohérence des statistiques", () => {
  const ordonne = (s: StatsPrix) => {
    expect(s.min).toBeLessThanOrEqual(s.mediane);
    expect(s.mediane).toBeLessThanOrEqual(s.max);
    if (s.quartiles) {
      expect(s.quartiles.p25).toBeLessThanOrEqual(s.mediane);
      expect(s.mediane).toBeLessThanOrEqual(s.quartiles.p75);
      expect(s.min).toBeLessThanOrEqual(s.quartiles.p25);
      expect(s.quartiles.p75).toBeLessThanOrEqual(s.max);
    }
  };

  it("min ≤ p25 ≤ médiane ≤ p75 ≤ max sur tous les ouvrages", async () => {
    const page = await ouvrages.listerOuvrages({}, { colonne: "libelle", sens: "asc" }, 1, 200);
    for (const r of page.lignes) {
      if (r.normaux) ordonne(r.normaux);
      if (r.ts) ordonne(r.ts);
    }
  });

  it("les quartiles sont null en dessous de 4 occurrences", async () => {
    const s = (await ouvrages.statsOuvrage(corniche))!;
    expect(s.n).toBe(1);
    expect(s.quartiles).toBeNull();
    expect(s.fiabilite).toBe("faible");
  });

  it("les prix TS sont supérieurs aux prix normaux", async () => {
    const n = (await ouvrages.statsOuvrage(ipn160, { typeTravaux: "normaux" }))!;
    const t = (await ouvrages.statsOuvrage(ipn160, { typeTravaux: "ts" }))!;
    expect(t.mediane).toBeGreaterThan(n.mediane);
  });
});

// ---------------------------------------------------------------------
// 4. Périmètre des agrégats
// ---------------------------------------------------------------------

describe("périmètre", () => {
  it("les ouvrages forfaitaires sont exclus du tableau des prix", async () => {
    const page = await ouvrages.listerOuvrages({}, { colonne: "libelle", sens: "asc" }, 1, 200);
    expect(page.lignes.some((r) => r.ouvrage.estForfaitaire)).toBe(false);
  });

  it("un forfait a des statistiques en % de chantier, pas en PU", async () => {
    const f = await ouvrages.statsForfait(etudeBeton);
    expect(f.length).toBeGreaterThan(0);
    expect(f[0].pctMedianChantier).toBeGreaterThan(0);
    expect(f[0].pctMedianChantier).toBeLessThan(100);
  });

  it("exclure une ligne modifie la médiane", async () => {
    const avant = (await ouvrages.statsOuvrage(ipn160))!;
    const lignes = await ouvrages.lignesSources(ipn160, {}, 1);
    // Le seed place une aberration à 2,5 × la médiane sur cet ouvrage.
    const aberrante = lignes.lignes.find((l) => (l.pu ?? 0) > avant.mediane * 2);
    expect(aberrante).toBeDefined();

    await ouvrages.exclureLigne(aberrante!.id, "Test automatisé");
    const apres = (await ouvrages.statsOuvrage(ipn160))!;
    expect(apres.n).toBe(avant.n - 1);
    expect(apres.max).toBeLessThan(avant.max);

    await ouvrages.reintegrerLigne(aberrante!.id);
    const retour = (await ouvrages.statsOuvrage(ipn160))!;
    expect(retour.n).toBe(avant.n);
  });

  it("un filtre de période réduit n sans le mettre à zéro", async () => {
    const tout = (await ouvrages.statsOuvrage(bicouche))!;
    const recent = await ouvrages.statsOuvrage(bicouche, { depuis: "2026-01-01" });
    expect(recent!.n).toBeGreaterThan(0);
    expect(recent!.n).toBeLessThan(tout.n);
  });
});

// ---------------------------------------------------------------------
// 5. Fiabilité de la zone
// ---------------------------------------------------------------------

describe("zone déduite", () => {
  it("au moins un ouvrage porte le drapeau de zone non fiable", async () => {
    const page = await ouvrages.listerOuvrages({}, { colonne: "libelle", sens: "asc" }, 1, 200);
    const stats = page.lignes.flatMap((r) => [r.normaux, r.ts]).filter(Boolean) as StatsPrix[];
    expect(stats.some((s) => !s.zoneToujoursFiable)).toBe(true);
  });
});

// ---------------------------------------------------------------------
// 6. Recherche
// ---------------------------------------------------------------------

describe("recherche", () => {
  it("trouve l'ouvrage malgré une faute de frappe", async () => {
    const r = await referentiel.chercherOuvrages("pacivation", 5);
    expect(r.some((o) => o.libelleDevis.toLowerCase().includes("passivation"))).toBe(true);
  });

  it("trouve un client malgré une faute de frappe", async () => {
    const c = await historique.chercherClient("croi du sud");
    expect(c.some((x) => x.nom.includes("Croix du Sud"))).toBe(true);
  });

  it("cherche aussi dans les désignations brutes", async () => {
    // « ventillation » n'existe que dans les lignes source, pas dans le
    // libellé propre. La recherche doit quand même remonter l'ouvrage.
    const r = await referentiel.chercherOuvrages("ventillation", 5);
    expect(r.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------
// 7. Document témoin
// ---------------------------------------------------------------------

describe("devis Croix du Sud", () => {
  it("est présent et arithmétiquement exact", async () => {
    const page = await historique.listerDocuments({ recherche: "Croix du Sud" }, 1);
    const doc = page.lignes.find((d) => d.numero === "DEV-2026-041");
    expect(doc).toBeDefined();
    expect(doc!.totalHt).toBeCloseTo(49548.0, 2);
    expect(doc!.nbLignes).toBe(8);

    const detail = (await historique.obtenirDocument(doc!.id))!;
    const somme = detail.lignes.reduce((s, l) => s + (l.total ?? 0), 0);
    expect(somme).toBeCloseTo(49548.0, 2);
    for (const l of detail.lignes) {
      if (l.quantite != null && l.pu != null && l.total != null) {
        expect(l.quantite * l.pu).toBeCloseTo(l.total, 2);
      }
    }
  });

  it("conserve les désignations verbatim, fautes comprises", async () => {
    const page = await historique.listerDocuments({ recherche: "Croix du Sud" }, 1);
    const detail = (await historique.obtenirDocument(page.lignes[0].id))!;
    const textes = detail.lignes.map((l) => l.designationBrute).join(" | ");
    expect(textes).toContain("Pacivation");
    expect(textes).toContain("ventillation");
  });
});

// ---------------------------------------------------------------------
// 8. Pagination
// ---------------------------------------------------------------------

describe("pagination", () => {
  it("ne renvoie jamais deux fois la même ligne entre deux pages", async () => {
    const tri = { colonne: "libelle" as const, sens: "asc" as const };
    const p1 = await ouvrages.listerOuvrages({}, tri, 1, 20);
    const p2 = await ouvrages.listerOuvrages({}, tri, 2, 20);
    const ids = new Set(p1.lignes.map((r) => r.ouvrage.id));
    expect(p2.lignes.some((r) => ids.has(r.ouvrage.id))).toBe(false);
    expect(p1.total).toBe(p2.total);
  });
});
