import { describe, it, expect } from "vitest";
import { dateDepuisNomFichier, parserDateFrancaise } from "@/lib/extraction/dates";

describe("parserDateFrancaise", () => {
  it("lit les formats courants des devis", () => {
    expect(parserDateFrancaise("FREJUS le 10/04/2026")).toBe("2026-04-10");
    expect(parserDateFrancaise("2025-03-01T00:00:00")).toBe("2025-03-01");
    expect(parserDateFrancaise("1er mars 2025")).toBe("2025-03-01");
    expect(parserDateFrancaise("Le 12 Février 2024")).toBe("2024-02-12");
    expect(parserDateFrancaise("avril 2026")).toBe("2026-04-01");
    expect(parserDateFrancaise("2026-04")).toBe("2026-04-01");
    expect(parserDateFrancaise("13.03.24")).toBe("2024-03-13");
  });
  it("refuse l'invraisemblable", () => {
    expect(parserDateFrancaise("31/02/2025")).toBeNull();
    expect(parserDateFrancaise("10/04/1999")).toBeNull();
    expect(parserDateFrancaise("")).toBeNull();
    expect(parserDateFrancaise(null)).toBeNull();
  });
});

describe("dateDepuisNomFichier", () => {
  it("retrouve la date dans les noms réels", () => {
    expect(dateDepuisNomFichier("SODOBAT-Ricci_ord2_rev00_130324.pdf")).toBe("2024-03-13");
    expect(dateDepuisNomFichier("Trame DDPGF lot2 20-01-21.xlsx")).toBe("2021-01-20");
    expect(dateDepuisNomFichier("2024 11 06 SODOBAT OS signé.pdf")).toBe("2024-11-06");
    expect(dateDepuisNomFichier("O02 - sodobat-dpgf-padel-nego 260824.pdf")).toBe("2024-08-26");
    expect(dateDepuisNomFichier("DPGF SODOBAT_ord_101225_rev00.pdf")).toBe("2025-12-10");
  });
  it("ignore les numéros qui ne sont pas des dates", () => {
    expect(dateDepuisNomFichier("20190390-DPGF Definitif.ods")).toBeNull();
    expect(dateDepuisNomFichier("M2026051- DPGFLotn02.pdf")).toBeNull();
    expect(dateDepuisNomFichier("DEVIS N°1425.pdf")).toBeNull();
  });
});
