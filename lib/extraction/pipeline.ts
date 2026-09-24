// =====================================================================
// Pipeline complet pour UN fichier : hash -> dédoublonnage -> dépôt
// Storage -> extraction (PDF ou tableur) -> contrôles -> insertion ->
// rattachements. Partagé par l'écran /import et le CLI de masse.
// =====================================================================

import { createHash } from "node:crypto";
import { sql } from "@/lib/db";
import { deposerFichier, telechargerFichier } from "@/lib/stockage";
import { extrairePdf } from "./pdf";
import { extraireTableur } from "./tableur";
import { insererDocument } from "./insertion";
import { rattacherDocument } from "./rattachement";

export type BilanFichier = {
  importId: string;
  statut: "insere" | "doublon" | "erreur";
  documentId?: string;
  statutDocument?: "valide" | "a_revoir";
  nbLignes?: number;
  nbLignesEcart?: number;
  ouvragesCrees?: number;
  rattachementsRegle?: number;
  rattachementsLlm?: number;
  erreur?: string;
};

const TYPES_MIME: Record<string, string> = {
  pdf: "application/pdf",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
};

function extension(nom: string): string {
  return nom.split(".").pop()?.toLowerCase() ?? "";
}

export function cheminStorage(hash: string, nom: string): string {
  // Supabase Storage n'accepte qu'un sous-ensemble ASCII dans les clés :
  // on translittère (é -> e) puis on remplace le reste par des tirets bas.
  const ascii = nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_");
  return `devis/${hash.slice(0, 12)}/${ascii}`;
}

export function formatAccepte(nom: string): boolean {
  return extension(nom) in TYPES_MIME;
}

async function majImport(
  importId: string,
  champs: { statut?: string; message?: string | null; documentId?: string; bilan?: unknown },
): Promise<void> {
  await sql`update imports set
    statut = coalesce(${champs.statut ?? null}, statut),
    message_erreur = ${champs.message ?? null},
    document_id = coalesce(${champs.documentId ?? null}, document_id),
    bilan = coalesce(${champs.bilan ? sql.json(champs.bilan as never) : null}, bilan),
    updated_at = now()
    where id = ${importId}`;
}

/**
 * Traite un fichier de bout en bout. Ne lève jamais : le résultat porte
 * le statut, l'erreur éventuelle est enregistrée sur la ligne d'import.
 *
 * `rattacher: false` (CLI de masse) : extraction + insertion seulement,
 * le rattachement est fait séquentiellement en 2ᵉ passe pour éviter la
 * création concurrente d'ouvrages canoniques en double.
 */
export async function traiterFichier(
  nom: string,
  contenu: Buffer,
  importIdExistant?: string,
  options: { rattacher?: boolean } = {},
): Promise<BilanFichier> {
  const rattacher = options.rattacher !== false;
  const hash = createHash("sha256").update(contenu).digest("hex");

  let importId = importIdExistant;
  if (!importId) {
    const [rec] = await sql`insert into imports
      (fichier_nom, fichier_hash, taille_octets, statut)
      values (${nom}, ${hash}, ${contenu.length}, 'en_attente')
      returning id`;
    importId = rec.id as string;
  } else {
    await sql`update imports set fichier_hash = ${hash},
      taille_octets = ${contenu.length}, message_erreur = null,
      updated_at = now() where id = ${importId}`;
  }

  try {
    const ext = extension(nom);
    if (!(ext in TYPES_MIME)) {
      throw new Error(`Format non pris en charge : .${ext} (pdf, xls, xlsx, ods).`);
    }

    // Dédoublonnage avant tout appel modèle. Le rattachement étant
    // idempotent (lignes déjà rattachées ignorées), on rattrape ici les
    // lignes restées orphelines d'un passage précédent.
    const [doublon] = await sql`
      select id from documents where fichier_hash = ${hash}`;
    if (doublon) {
      if (rattacher) {
        try {
          await rattacherDocument(doublon.id as string);
        } catch {
          // rattrapage best-effort : le doublon reste un doublon
        }
      }
      await majImport(importId, {
        statut: "doublon",
        documentId: doublon.id as string,
        message: "Fichier déjà importé (hash identique).",
      });
      return { importId, statut: "doublon", documentId: doublon.id as string };
    }

    await majImport(importId, { statut: "extraction" });

    // Dépôt du fichier source dans Storage (avant extraction : même en cas
    // d'échec d'extraction, le fichier est conservé pour relance).
    const chemin = cheminStorage(hash, nom);
    await deposerFichier(chemin, contenu, TYPES_MIME[ext]);

    const { extrait, brut, nbPages } =
      ext === "pdf"
        ? await extrairePdf(contenu, nom)
        : await extraireTableur(contenu);

    await majImport(importId, { statut: "extrait" });

    const insertion = await insererDocument({
      extrait,
      brut,
      fichierNom: nom,
      fichierHash: hash,
      storagePath: chemin,
      nbPages,
    });

    // Le document est en base : un échec de rattachement n'est plus
    // fatal (les lignes orphelines seront rattrapées à la relance).
    let rattachement = { parTrigramme: 0, parLlm: 0, ouvragesCrees: 0 };
    let messageRattachement: string | null = null;
    if (rattacher) {
      try {
        rattachement = await rattacherDocument(insertion.documentId);
      } catch (e) {
        messageRattachement = `Inséré, mais rattachement incomplet : ${
          e instanceof Error ? e.message : String(e)
        }`.slice(0, 1000);
      }
    }

    const bilan: BilanFichier = {
      importId,
      statut: "insere",
      documentId: insertion.documentId,
      statutDocument: insertion.statut,
      nbLignes: insertion.nbLignes,
      nbLignesEcart: insertion.nbLignesEcart,
      ouvragesCrees: rattachement.ouvragesCrees,
      rattachementsRegle: rattachement.parTrigramme,
      rattachementsLlm: rattachement.parLlm,
    };
    await majImport(importId, {
      statut: "insere",
      documentId: insertion.documentId,
      message: messageRattachement,
      bilan,
    });
    return bilan;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await majImport(importId, { statut: "erreur", message });
    return { importId, statut: "erreur", erreur: message };
  }
}

/**
 * Relance un import en échec : le fichier est repris dans Storage
 * (il y est déposé avant l'extraction), puis repasse tout le pipeline.
 */
export async function relancerImport(importId: string): Promise<BilanFichier> {
  const [rec] = await sql`
    select fichier_nom, fichier_hash from imports where id = ${importId}`;
  if (!rec) throw new Error("Import inconnu.");
  if (!rec.fichier_hash) throw new Error("Import sans hash : redéposer le fichier.");
  const contenu = await telechargerFichier(
    cheminStorage(rec.fichier_hash as string, rec.fichier_nom as string),
  );
  return traiterFichier(rec.fichier_nom as string, contenu, importId);
}

/** À appeler une fois après un lot de fichiers. */
export async function rafraichirAgregats(): Promise<void> {
  await sql`select rafraichir_agregats()`;
}
