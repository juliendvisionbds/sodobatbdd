"use client";

// Onglet « Lots » : arborescence des lots (créer, renommer, déplacer,
// supprimer), rangement des ouvrages, et proposition de l'IA à valider.

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  accepterLotProposeAction,
  affecterOuvragesAuLotAction,
  appliquerAffectationsProposeesAction,
  creerLotAction,
  deplacerLotAction,
  ouvragesDuLotAction,
  refuserLotProposeAction,
  renommerLotAction,
  supprimerLotAction,
} from "@/lib/actions/lots";
import type { LotNoeud, LotPropose, Ouvrage } from "@/lib/types";
import { LIBELLES_UNITES } from "@/lib/types";
import { DialogueConfirmation } from "./Superposee";

type OuvrageLot = Ouvrage & { nbLignes: number };

function aplatir(lots: LotNoeud[], profondeur = 0): Array<{ lot: LotNoeud; profondeur: number }> {
  return lots.flatMap((l) => [{ lot: l, profondeur }, ...aplatir(l.enfants, profondeur + 1)]);
}

export function CalageLots({
  lots,
  proposes,
  versExistants,
}: {
  lots: LotNoeud[];
  proposes: LotPropose[];
  versExistants: Array<{ lotCode: string; libelle: string; nbOuvrages: number }>;
}) {
  const router = useRouter();
  const plats = aplatir(lots);
  const [actif, setActif] = useState<string | null>(plats[0]?.lot.id ?? null);
  const [ouvrages, setOuvrages] = useState<OuvrageLot[]>([]);
  const [recherche, setRecherche] = useState("");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [cibleDeplacement, setCibleDeplacement] = useState<string>("");
  const [edition, setEdition] = useState<{ id: string; code: string; libelle: string } | null>(null);
  const [nouveau, setNouveau] = useState<{ parentId: string | null } | null>(null);
  const [aSupprimer, setASupprimer] = useState<LotNoeud | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const lotActif = plats.find((p) => p.lot.id === actif)?.lot ?? null;

  const charger = useCallback(async () => {
    if (!actif) return;
    setOuvrages(await ouvragesDuLotAction(actif, recherche || undefined));
    setSelection(new Set());
  }, [actif, recherche]);
  useEffect(() => {
    charger().catch((e) => setErreur(String(e)));
  }, [charger]);

  const executer = (fn: () => Promise<string | void>) =>
    demarrer(async () => {
      setErreur(null);
      try {
        const m = await fn();
        if (m) setMessage(m);
        router.refresh();
        await charger();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e));
      }
    });

  return (
    <div className="flex flex-col gap-[22px]">
      {erreur && <p className="vx-insight vx-insight--neg !py-3 text-[14px] text-red">{erreur}</p>}
      {message && <p className="vx-insight vx-insight--pos !py-3 text-[14px] font-medium text-green">{message}</p>}

      {/* ---------- proposition de l'IA ---------- */}
      {(proposes.length > 0 || versExistants.length > 0) && (
        <section className="vx-panel">
          <h2 className="vx-panel__title">Proposition de l&apos;IA</h2>
          <p className="vx-panel__desc mb-4 mt-1">
            Sous-lots suggérés à partir des ouvrages existants. Acceptez un sous-lot
            pour le créer, puis « Ranger les ouvrages » pour appliquer les affectations.
          </p>
          <ul className="flex flex-col gap-2">
            {proposes.map((p) => (
              <li key={p.code} className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line px-4 py-3">
                <span className="mono text-[12.5px] text-sub">{p.code}</span>
                <span className="font-semibold">{p.libelle}</span>
                <span className="text-[12.5px] text-sub">sous {p.parentCode ?? "la racine"} · {p.nbOuvrages} ouvrage{p.nbOuvrages > 1 ? "s" : ""}</span>
                {p.motif && <span className="max-w-[360px] truncate text-[12.5px] text-faint" title={p.motif}>{p.motif}</span>}
                <span className="flex-1" />
                {p.statut === "accepte" ? (
                  <>
                    <span className="badge b-green">créé</span>
                    {p.nbOuvrages > 0 && (
                      <button type="button" disabled={enCours} className="vx-btn-outline !py-1.5"
                        onClick={() => executer(async () => `${await appliquerAffectationsProposeesAction(p.code)} ouvrage(s) rangé(s) dans ${p.code}.`)}>
                        Ranger les {p.nbOuvrages} ouvrages
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button type="button" disabled={enCours} className="vx-btn-ghost"
                      onClick={() => executer(async () => { await refuserLotProposeAction(p.code); return `${p.code} refusé.`; })}>
                      Refuser
                    </button>
                    <button type="button" disabled={enCours} className="vx-btn-outline !py-1.5"
                      onClick={() => executer(async () => { await accepterLotProposeAction(p.code); return `Lot ${p.code} créé.`; })}>
                      Accepter
                    </button>
                  </>
                )}
              </li>
            ))}
            {versExistants.map((v) => (
              <li key={v.lotCode} className="flex flex-wrap items-center gap-3 rounded-[10px] border border-hairline px-4 py-3">
                <span className="mono text-[12.5px] text-sub">{v.lotCode}</span>
                <span className="font-semibold">{v.libelle}</span>
                <span className="text-[12.5px] text-sub">lot existant · {v.nbOuvrages} ouvrage{v.nbOuvrages > 1 ? "s" : ""} à y déplacer</span>
                <span className="flex-1" />
                <button type="button" disabled={enCours} className="vx-btn-outline !py-1.5"
                  onClick={() => executer(async () => `${await appliquerAffectationsProposeesAction(v.lotCode)} ouvrage(s) rangé(s) dans ${v.lotCode}.`)}>
                  Ranger les {v.nbOuvrages} ouvrages
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- arbre + ouvrages ---------- */}
      <div className="grid grid-cols-1 gap-[22px] lg:grid-cols-[320px_1fr]">
        <section className="vx-panel !p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="vx-panel__title !text-[16px]">Arborescence</h2>
            <button type="button" className="vx-btn-ghost" onClick={() => setNouveau({ parentId: null })}>+ Lot</button>
          </div>
          <ul>
            {plats.map(({ lot, profondeur }) => (
              <li key={lot.id}>
                <div
                  className={`flex items-center gap-1.5 rounded-[7px] px-2 py-[5px] text-[13.5px] ${
                    actif === lot.id ? "bg-navy font-semibold text-white" : "hover:bg-navy-tint"
                  }`}
                  style={{ paddingLeft: 8 + profondeur * 16 }}
                >
                  <button type="button" onClick={() => setActif(lot.id)} className="flex min-w-0 flex-1 items-baseline gap-2 text-left">
                    <span className={`mono text-[11px] ${actif === lot.id ? "text-white/80" : "text-faint"}`}>{lot.code}</span>
                    <span className="truncate">{lot.libelle}</span>
                    <span className={`mono ml-auto text-[11.5px] ${actif === lot.id ? "text-white/80" : "text-faint"}`}>{lot.nbOuvragesCumule}</span>
                  </button>
                  {actif === lot.id && (
                    <span className="flex shrink-0 gap-1">
                      <button type="button" title="Sous-lot" className="rounded px-1 text-[12px] text-white/90 hover:bg-white/20" onClick={() => setNouveau({ parentId: lot.id })}>+</button>
                      <button type="button" title="Renommer" className="rounded px-1 text-[12px] text-white/90 hover:bg-white/20" onClick={() => setEdition({ id: lot.id, code: lot.code, libelle: lot.libelle })}>✎</button>
                      <button type="button" title="Supprimer" className="rounded px-1 text-[12px] text-white/90 hover:bg-white/20" onClick={() => setASupprimer(lot)}>✕</button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {lotActif && (
            <div className="mt-3 border-t border-hairline pt-3 text-[12.5px]">
              <label className="text-sub">
                Déplacer « {lotActif.libelle} » sous
                <select
                  className="vx-select mt-1 w-full !py-1.5 !text-[13px]"
                  value=""
                  disabled={enCours}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") return;
                    executer(async () => { await deplacerLotAction(lotActif.id, v === "racine" ? null : v); return `Lot déplacé.`; });
                  }}
                >
                  <option value="">—</option>
                  <option value="racine">la racine</option>
                  {plats.filter((p) => p.lot.id !== lotActif.id).map((p) => (
                    <option key={p.lot.id} value={p.lot.id}>{"  ".repeat(p.profondeur)}{p.lot.code} · {p.lot.libelle}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </section>

        <section className="vx-panel !p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
            <h2 className="vx-panel__title !text-[16px]">{lotActif ? `${lotActif.code} · ${lotActif.libelle}` : "Ouvrages"}</h2>
            <span className="text-[12.5px] text-sub">{ouvrages.length} ouvrage{ouvrages.length > 1 ? "s" : ""}{ouvrages.length >= 200 ? " (200 premiers)" : ""}</span>
            <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Filtrer…" aria-label="Filtrer les ouvrages" className="vx-input ml-auto !min-w-[180px] !py-[6px] !text-[13px]" />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-2.5 text-[13px]">
            <span className="text-sub">{selection.size} sélectionné{selection.size > 1 ? "s" : ""}</span>
            <select className="vx-select !py-1.5 !text-[13px]" value={cibleDeplacement} onChange={(e) => setCibleDeplacement(e.target.value)} aria-label="Lot de destination">
              <option value="">Affecter au lot…</option>
              <option value="aucun">(aucun lot)</option>
              {plats.map((p) => (
                <option key={p.lot.id} value={p.lot.id}>{"  ".repeat(p.profondeur)}{p.lot.code} · {p.lot.libelle}</option>
              ))}
            </select>
            <button type="button" disabled={enCours || selection.size === 0 || !cibleDeplacement} className="vx-btn-outline !py-1.5 disabled:opacity-40"
              onClick={() => executer(async () => {
                const n = await affecterOuvragesAuLotAction([...selection], cibleDeplacement === "aucun" ? null : cibleDeplacement);
                setCibleDeplacement("");
                return `${n} ouvrage(s) déplacé(s).`;
              })}>
              Déplacer
            </button>
          </div>
          <table className="vx-tbl">
            <thead>
              <tr>
                <th className="!w-8">
                  <input type="checkbox" aria-label="Tout cocher" className="accent-[var(--navy)]"
                    checked={ouvrages.length > 0 && selection.size === ouvrages.length}
                    onChange={(e) => setSelection(e.target.checked ? new Set(ouvrages.map((o) => o.id)) : new Set())} />
                </th>
                <th>Ouvrage</th>
                <th>U.</th>
                <th className="vx-r">Lignes</th>
              </tr>
            </thead>
            <tbody>
              {ouvrages.map((o) => (
                <tr key={o.id}>
                  <td><input type="checkbox" aria-label="Sélectionner" className="accent-[var(--navy)]" checked={selection.has(o.id)}
                    onChange={() => setSelection((s) => { const n = new Set(s); if (n.has(o.id)) n.delete(o.id); else n.add(o.id); return n; })} /></td>
                  <td><span className="mono mr-2 text-[11.5px] text-faint">{o.code ?? "—"}</span>{o.libelleDevis}</td>
                  <td className="vx-cell-muted">{o.unite ? LIBELLES_UNITES[o.unite] : "—"}</td>
                  <td className="vx-cell-amount">{o.nbLignes}</td>
                </tr>
              ))}
              {ouvrages.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-sub">Aucun ouvrage dans ce lot.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      {(nouveau || edition) && (
        <FormulaireLot
          titre={edition ? "Renommer le lot" : "Nouveau lot"}
          initial={edition ?? { code: "", libelle: "" }}
          parentLibelle={nouveau?.parentId ? plats.find((p) => p.lot.id === nouveau.parentId)?.lot.libelle ?? null : null}
          enCours={enCours}
          fermer={() => { setNouveau(null); setEdition(null); }}
          valider={(code, libelle) => {
            const parentId = nouveau?.parentId ?? null;
            const idEdite = edition?.id;
            setNouveau(null); setEdition(null);
            executer(async () => {
              if (idEdite) { await renommerLotAction(idEdite, { code, libelle }); return "Lot renommé."; }
              const lot = await creerLotAction({ code, libelle, parentId });
              setActif(lot.id);
              return `Lot ${lot.code} créé.`;
            });
          }}
        />
      )}
      {aSupprimer && (
        <DialogueConfirmation
          titre={`Supprimer le lot ${aSupprimer.code} ?`}
          corps={<>« {aSupprimer.libelle} » sera supprimé. Un lot n&apos;est supprimable que s&apos;il ne contient ni ouvrage ni sous-lot.</>}
          libelleConfirmer="Supprimer"
          ton="danger"
          enCours={enCours}
          confirmer={() => { const l = aSupprimer; setASupprimer(null); executer(async () => { await supprimerLotAction(l.id); setActif(null); return "Lot supprimé."; }); }}
          fermer={() => setASupprimer(null)}
        />
      )}
    </div>
  );
}

function FormulaireLot({
  titre, initial, parentLibelle, enCours, fermer, valider,
}: {
  titre: string;
  initial: { code: string; libelle: string };
  parentLibelle: string | null;
  enCours: boolean;
  fermer: () => void;
  valider: (code: string, libelle: string) => void;
}) {
  const [code, setCode] = useState(initial.code);
  const [libelle, setLibelle] = useState(initial.libelle);
  return (
    <DialogueConfirmation
      titre={titre}
      corps={
        <div className="flex flex-col gap-3">
          {parentLibelle && <span className="text-[12.5px] text-faint">Sous « {parentLibelle} »</span>}
          <label className="text-[13px] font-semibold text-sub">Code
            <input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="GO.BA.DAL" className="vx-input mono mt-1 w-full !min-w-0" />
          </label>
          <label className="text-[13px] font-semibold text-sub">Libellé
            <input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Dalles et planchers" className="vx-input mt-1 w-full !min-w-0" />
          </label>
        </div>
      }
      libelleConfirmer="Enregistrer"
      enCours={enCours}
      confirmer={() => { if (code.trim() && libelle.trim()) valider(code.trim(), libelle.trim()); }}
      fermer={fermer}
    />
  );
}
