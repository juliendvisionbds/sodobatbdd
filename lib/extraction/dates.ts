// =====================================================================
// Dates de pièce : les devis écrivent « FREJUS le 10/04/2026 », « 1er
// mars 2025 », « avril 2026 » ; les noms de fichier portent parfois la
// seule date connue (130324, 20-01-21, 2024 11 06). Tout est ramené à
// AAAA-MM-JJ, avec un garde-fou sur l'année.
// =====================================================================

const MOIS: Record<string, number> = {
  janv: 1, jan: 1, janvier: 1,
  fev: 2, fév: 2, fevr: 2, févr: 2, fevrier: 2, février: 2,
  mars: 3, mar: 3,
  avr: 4, avril: 4,
  mai: 5,
  juin: 6, jun: 6,
  juil: 7, juillet: 7, jul: 7,
  aout: 8, août: 8, aou: 8,
  sept: 9, sep: 9, septembre: 9,
  oct: 10, octobre: 10,
  nov: 11, novembre: 11,
  dec: 12, déc: 12, decembre: 12, décembre: 12,
};

function anneePlausible(a: number): boolean {
  return a >= 2010 && a <= new Date().getFullYear() + 1;
}

function iso(a: number, m: number, j: number): string | null {
  if (!anneePlausible(a) || m < 1 || m > 12 || j < 1 || j > 31) return null;
  const d = new Date(Date.UTC(a, m - 1, j));
  if (d.getUTCMonth() !== m - 1) return null; // 31/02
  return `${a}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
}

function annee2ou4(t: string): number {
  return t.length === 2 ? 2000 + Number(t) : Number(t);
}

/** Texte libre → AAAA-MM-JJ, ou null. */
export function parserDateFrancaise(texte: string | null | undefined): string | null {
  if (!texte) return null;
  const t = texte.trim().toLowerCase();

  let m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));

  m = t.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})\b/);
  if (m) return iso(annee2ou4(m[3]), Number(m[2]), Number(m[1]));

  m = t.match(/\b(\d{1,2})(?:er)?\s+([a-zéû]+)\.?\s+(\d{4})\b/);
  if (m && MOIS[m[2]]) return iso(Number(m[3]), MOIS[m[2]], Number(m[1]));

  m = t.match(/\b([a-zéû]+)\.?\s+(\d{4})\b/);
  if (m && MOIS[m[1]]) return iso(Number(m[2]), MOIS[m[1]], 1);

  m = t.match(/\b(\d{4})-(\d{2})\b/);
  if (m) return iso(Number(m[1]), Number(m[2]), 1);

  return null;
}

/** Nom de fichier → AAAA-MM-JJ, ou null. Première date plausible. */
export function dateDepuisNomFichier(nom: string): string | null {
  const t = nom.replace(/\.[a-z0-9]{2,5}$/i, "");

  let m = t.match(/(20\d{2})[-_ .]?(0[1-9]|1[0-2])[-_ .]?(0[1-9]|[12]\d|3[01])(?!\d)/);
  if (m) {
    const d = iso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (d) return d;
  }
  m = t.match(/(?<!\d)(0[1-9]|[12]\d|3[01])[-_./](0[1-9]|1[0-2])[-_./](20\d{2}|\d{2})(?!\d)/);
  if (m) {
    const d = iso(annee2ou4(m[3]), Number(m[2]), Number(m[1]));
    if (d) return d;
  }
  m = t.match(/(?<!\d)(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(\d{2})(?!\d)/);
  if (m) {
    const d = iso(2000 + Number(m[3]), Number(m[2]), Number(m[1]));
    if (d) return d;
  }
  m = t.match(/(?<!\d)(20\d{2})[-_ .](0[1-9]|1[0-2])(?!\d)/);
  if (m) {
    const d = iso(Number(m[1]), Number(m[2]), 1);
    if (d) return d;
  }
  return null;
}
