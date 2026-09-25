"use client";

// Onglet « Documents à revoir » : pièces dont le total imprimé ne tombe
// pas juste. Les lignes cohérentes comptent déjà dans les prix ; ici on
// accepte (le total est validé), on rejette (motif obligatoire, toutes
// les lignes sortent des prix) ou on bascule la nature TS.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  accepterDocumentAction,
  basculerTsAction,
  rejeterDocumentAction,
} from "@/lib/actions/documents";
import { date as fmtDate, euro, nombre, LIBELLES_ZONES, type DocumentARevoir } from "@/lib/types";
import { useParamsUrl } from "./useParamsUrl";
import { FormulaireDocument } from "./FormulaireDocument";

export function CalageDocuments({
  docs: initial,
  incomplets = false,
}: {
  docs: DocumentARevoir[];
  /** Mode « pièces incomplètes » (sans date, zone ou client). */
  incomplets?: boolean;
}) {
  const router = useRouter();
  const { modifier } = useParamsUrl();
  const [docs, setDocs] = useState(initial);
  const [pageRef, setPageRef] = useState(initial);
  if (pageRef !== initial) {
    setPageRef(initial);
    setDocs(initial);
  }
  const [edition, setEdition] = useState<string | null>(null);
  const [rejetEnCours, setRejetEnCours] = useState<string | null>(null);
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const retirer = (id: string) => setDocs((ds) => ds.filter((d) => d.id !== id));

  const accepter = (d: DocumentARevoir) =>
    demarrer(async () => {
      await accepterDocumentAction(d.id);
      retirer(d.id);
      router.refresh();
    });

  const rejeter = (d: DocumentARevoir) => {
    if (!motif.trim()) {
      setErreur("Indiquer un motif (ex. : doublon, pièce illisible, hors périmètre).");
      return;
    }
    demarrer(async () => {
      await rejeterDocumentAction(d.id, motif);
      setRejetEnCours(null);
      setMotif("");
      setErreur(null);
      retirer(d.id);
      router.refresh();
    });
  };

  const basculerTs = (d: DocumentARevoir) =>
    demarrer(async () => {
      await basculerTsAction(d.id, !d.estTs);
      setDocs((ds) => ds.map((x) => (x.id === d.id ? { ...x, estTs: !x.estTs } : x)));
      router.refresh();
    });

  const bascule = (
    <div className="vx-chips">
      <button type="button" className="vx-chip" aria-pressed={!incomplets} onClick={() => modifier({ incomplets: null })}>
        Écart de total
      </button>
      <button type="button" className="vx-chip" aria-pressed={incomplets} onClick={() => modifier({ incomplets: "1" })}>
        Pièces incomplètes (date, zone ou client)
      </button>
    </div>
  );

  if (docs.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {bascule}
        <p className="vx-panel py-16 text-center text-[15px] text-sub">
          {incomplets ? "Toutes les pièces ont une date, une zone et un client." : "Aucune pièce en attente de revue."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[22px]">
      {bascule}
      {!incomplets && (
        <p className="vx-insight !py-3 text-[13.5px]">
          Une ligne dont quantité × PU = total compte déjà dans les prix, même si
          la pièce est à revoir. <strong>Accepter</strong> valide aussi le total de
          la pièce. <strong>Rejeter</strong> retire toutes ses lignes des prix.
        </p>
      )}
      {docs.map((d) => (
        <article key={d.id} className="vx-panel">
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-3">
            <span className="mono text-[13.5px] font-medium text-navy">
              {d.numero ?? "Pièce"}
            </span>
            <span className="mono text-[13px] text-sub">
              {d.date ? fmtDate(d.date) : <span className="badge b-amber">sans date</span>}
            </span>
            <span className="text-[14px] font-semibold">
              {d.client ?? <span className="badge b-amber">client inconnu</span>}
            </span>
            <span className="text-[12.5px] text-sub">
              {d.zone ? LIBELLES_ZONES[d.zone] : <span className="badge b-amber">sans zone</span>}
              {d.zone && !d.zoneFiable && <span className="badge b-amber ml-1">zone déduite</span>}
            </span>
            {d.chantierObjet && (
              <span className="max-w-[360px] truncate text-[13px] text-sub" title={d.chantierObjet}>
                {d.chantierObjet}
              </span>
            )}
            <span className="text-[12px] text-faint" title={d.fichierNom}>
              {d.nbLignes} lignes
              {d.nbLignesEcart > 0 ? ` · ${d.nbLignesEcart} en écart` : ""}
            </span>
            <span className="mono ml-auto text-[13.5px] font-medium">
              {euro(d.totalHt)}
              {d.controleTotal === "non_verifiable" && (
                <span className="badge b-amber ml-2" title="Aucun total lisible sur la pièce">
                  total invérifiable
                </span>
              )}
              {d.ecartTotal != null && d.ecartTotal !== 0 && (
                <span className="badge b-red ml-2">écart total {euro(d.ecartTotal)}</span>
              )}
            </span>
          </header>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {d.lienPdf ? (
              <a href={d.lienPdf} target="_blank" rel="noreferrer" className="vx-btn-outline">
                Pièce d&apos;origine ↗
              </a>
            ) : (
              <span className="text-[12.5px] text-faint">Pièce d&apos;origine absente</span>
            )}
            <label className="flex cursor-pointer items-center gap-2 rounded-[8px] border border-line px-3 py-[7px] text-[13.5px]">
              <input
                type="checkbox"
                checked={d.estTs}
                disabled={enCours}
                onChange={() => basculerTs(d)}
                className="accent-[var(--navy)]"
              />
              Travaux supplémentaires (TS)
            </label>
            <button
              type="button"
              onClick={() => setEdition(edition === d.id ? null : d.id)}
              className="vx-btn-outline"
            >
              {edition === d.id ? "Fermer" : "Modifier la pièce…"}
            </button>
            <span className="flex-1" />
            {incomplets ? null : (<>
            <button
              type="button"
              disabled={enCours}
              onClick={() => accepter(d)}
              title="Le total est considéré comme juste ; la pièce passe en validée."
              className="vx-btn !px-4 !py-2 !text-[14px]"
            >
              Accepter
            </button>
            <button
              type="button"
              disabled={enCours}
              onClick={() => {
                setRejetEnCours(rejetEnCours === d.id ? null : d.id);
                setMotif("");
                setErreur(null);
              }}
              className="rounded-[9px] border border-red bg-surface px-4 py-2 text-[14px] font-semibold text-red transition-colors hover:bg-red-bg disabled:opacity-40"
            >
              Rejeter…
            </button>
            </>)}
          </div>

          {edition === d.id && (
            <FormulaireDocument
              doc={{
                id: d.id, date: d.date, typeDocument: d.typeDocument, estTs: d.estTs, numero: d.numero,
                client: d.client, chantierObjet: d.chantierObjet, chantierCodePostal: d.chantierCodePostal,
                chantierCommune: d.chantierCommune, zone: d.zone,
              }}
              fermer={() => setEdition(null)}
              apres={(champs) =>
                setDocs((ds) => ds.map((x) => x.id === d.id ? {
                  ...x,
                  date: champs.dateDocument ?? x.date,
                  estTs: champs.estTs ?? x.estTs,
                  client: champs.clientNom ?? x.client,
                  zone: champs.zoneCode ?? x.zone,
                } : x))
              }
            />
          )}

          {rejetEnCours === d.id && (
            <form
              className="mt-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-red bg-red-bg p-3"
              onSubmit={(e) => {
                e.preventDefault();
                rejeter(d);
              }}
            >
              <input
                autoFocus
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setRejetEnCours(null);
                }}
                placeholder="Motif du rejet (obligatoire)"
                aria-label="Motif du rejet"
                className="vx-input flex-1 !min-w-[220px] !py-[7px]"
              />
              <button type="submit" disabled={enCours} className="vx-btn-outline !border-red !text-red">
                Confirmer le rejet
              </button>
              <button type="button" onClick={() => setRejetEnCours(null)} className="vx-btn-ghost">
                Annuler
              </button>
              {erreur && <span className="w-full text-[12.5px] text-red">{erreur}</span>}
            </form>
          )}

          {incomplets ? null : d.lignesEnEcart.length > 0 ? (
            <table className="vx-tbl mt-3">
              <thead>
                <tr>
                  <th>Lignes en écart (exclues des prix)</th>
                  <th className="vx-r">Qté</th>
                  <th className="vx-r">PU HT</th>
                  <th className="vx-r">Total imprimé</th>
                  <th className="vx-r">Écart qté × PU</th>
                </tr>
              </thead>
              <tbody>
                {d.lignesEnEcart.map((l) => (
                  <tr key={l.id}>
                    <td className="max-w-[380px] truncate" title={l.designation}>{l.designation}</td>
                    <td className="vx-cell-amount">{nombre(l.quantite)}</td>
                    <td className="vx-cell-amount">{nombre(l.pu)}</td>
                    <td className="vx-cell-amount">{nombre(l.total)}</td>
                    <td className="vx-cell-amount !font-medium !text-red">{nombre(l.ecart)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="pt-3 text-[13px] text-sub">
              Toutes les lignes sont cohérentes individuellement : l&apos;écart
              porte sur le total du document (remise, arrondi, ligne oubliée).
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
