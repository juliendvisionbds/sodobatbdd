"use client";

// =====================================================================
// Onglet référentiel du calage : édition d'un ouvrage canonique et
// fusion de deux ouvrages (repointe les rattachements, conserve
// l'historique).
// =====================================================================

import { useRef, useState, useTransition } from "react";
import {
  rechercherOuvragesAction,
  modifierOuvrageAction,
  fusionnerOuvragesAction,
} from "@/lib/actions/calage";
import {
  LIBELLES_UNITES,
  type CodeUnite,
  type Ouvrage,
} from "@/lib/types";
import { DialogueConfirmation } from "./Superposee";

const UNITES: CodeUnite[] = [
  "m2", "ml", "m3", "u", "kg", "h", "j", "ens", "forfait",
];

function ChampRecherche({
  etiquette,
  choisi,
  surChoix,
}: {
  etiquette: string;
  choisi: Ouvrage | null;
  surChoix: (o: Ouvrage | null) => void;
}) {
  const [requete, setRequete] = useState("");
  const [resultats, setResultats] = useState<Ouvrage[]>([]);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chercher = (v: string) => {
    setRequete(v);
    surChoix(null);
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(async () => {
      setResultats(v.trim() ? await rechercherOuvragesAction(v) : []);
    }, 180);
  };

  return (
    <div className="relative">
      <label className="text-[13px] font-semibold text-sub">
        {etiquette}
        <input
          type="search"
          value={choisi ? `${choisi.code ?? ""} ${choisi.libelleDevis}`.trim() : requete}
          onChange={(e) => chercher(e.target.value)}
          placeholder="Code ou libellé…"
          className="vx-input mt-1 w-full !min-w-0"
        />
      </label>
      {!choisi && resultats.length > 0 && (
        <ul className="vx-menu absolute left-0 right-0 top-full z-20 mt-1.5 max-h-[260px] overflow-y-auto">
          {resultats.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => {
                  surChoix(o);
                  setResultats([]);
                }}
                className="w-full rounded-[7px] px-2.5 py-2 text-left text-[13.5px] hover:bg-navy-tint"
              >
                <span className="mono mr-2 text-[12px] text-sub">
                  {o.code ?? "—"}
                </span>
                {o.libelleDevis}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CalageReferentiel({
  lots,
}: {
  lots: Array<{ id: string; code: string; libelle: string }>;
}) {
  const [edite, setEdite] = useState<Ouvrage | null>(null);
  const [source, setSource] = useState<Ouvrage | null>(null);
  const [cible, setCible] = useState<Ouvrage | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [enCours, demarrer] = useTransition();

  const enregistrer = (form: FormData) => {
    if (!edite) return;
    demarrer(async () => {
      await modifierOuvrageAction(edite.id, {
        libelleDevis: String(form.get("libelle") ?? "") || undefined,
        libelleNormalise: String(form.get("normalise") ?? "") || undefined,
        code: String(form.get("code") ?? "") || undefined,
        lotId: String(form.get("lot") ?? "") || undefined,
        unite: (String(form.get("unite") ?? "") || undefined) as
          | CodeUnite
          | undefined,
        estForfaitaire: form.get("forfait") === "on",
        actif: form.get("actif") === "on",
      });
      setMessage(`Ouvrage « ${String(form.get("libelle"))} » enregistré.`);
      setEdite(null);
    });
  };

  const fusionner = () => {
    if (!source || !cible || source.id === cible.id) return;
    demarrer(async () => {
      await fusionnerOuvragesAction(source.id, cible.id);
      setConfirmation(false);
      setMessage(
        `« ${source.libelleDevis} » fusionné dans « ${cible.libelleDevis} ». Les rattachements sont repointés, l'historique conservé. Z dans les autres onglets annule ce geste.`,
      );
      setSource(null);
      setCible(null);
    });
  };

  return (
    <div className="flex flex-col gap-[22px]">
      {message && (
        <p className="vx-insight vx-insight--pos !py-3 text-[14px] font-medium text-green">
          {message}
        </p>
      )}

      {/* ---------- édition ---------- */}
      <section className="vx-panel">
        <h2 className="vx-panel__title mb-4">Éditer un ouvrage canonique</h2>
        <ChampRecherche etiquette="Ouvrage à modifier" choisi={edite} surChoix={setEdite} />
        {edite && (
          <form
            action={enregistrer}
            className="vx-detail mt-4 !flex-col !gap-3"
          >
            <label className="text-[13px] font-semibold text-sub">
              Libellé devis (affiché partout)
              <input
                name="libelle"
                defaultValue={edite.libelleDevis}
                required
                className="vx-input mt-1 w-full !min-w-0"
              />
            </label>
            <label className="text-[13px] font-semibold text-sub">
              Libellé normalisé (rapprochement uniquement)
              <input
                name="normalise"
                defaultValue={edite.libelleNormalise}
                className="vx-input mt-1 w-full !min-w-0"
              />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="text-[13px] font-semibold text-sub">
                Code
                <input
                  name="code"
                  defaultValue={edite.code ?? ""}
                  className="vx-input mono mt-1 w-full !min-w-0"
                />
              </label>
              <label className="text-[13px] font-semibold text-sub">
                Lot
                <select
                  name="lot"
                  defaultValue={edite.lotId ?? ""}
                  className="vx-select mt-1 w-full"
                >
                  <option value="">—</option>
                  {lots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} · {l.libelle}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[13px] font-semibold text-sub">
                Unité
                <select
                  name="unite"
                  defaultValue={edite.unite ?? ""}
                  className="vx-select mt-1 w-full"
                >
                  <option value="">—</option>
                  {UNITES.map((u) => (
                    <option key={u} value={u}>
                      {LIBELLES_UNITES[u]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  name="forfait"
                  defaultChecked={edite.estForfaitaire}
                  className="accent-[var(--navy)]"
                />
                Forfaitaire
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  name="actif"
                  defaultChecked={edite.actif}
                  className="accent-[var(--navy)]"
                />
                Actif
              </label>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={enCours}
                className="vx-btn !px-4 !py-2 !text-[14px]"
              >
                {enCours ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* ---------- fusion ---------- */}
      <section className="vx-panel">
        <h2 className="vx-panel__title">Fusionner deux ouvrages</h2>
        <p className="vx-panel__desc mb-4 mt-1">
          Les rattachements de la source sont repointés vers la cible, la
          source est désactivée. Les lignes historiques sont conservées.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ChampRecherche etiquette="Source (sera désactivé)" choisi={source} surChoix={setSource} />
          <ChampRecherche etiquette="Cible (reçoit l'historique)" choisi={cible} surChoix={setCible} />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={!source || !cible || source.id === cible.id || enCours}
            onClick={() => setConfirmation(true)}
            className="rounded-[9px] border border-red bg-surface px-4 py-2 text-[14px] font-semibold text-red transition-colors hover:bg-red-bg disabled:opacity-40"
          >
            {enCours ? "Fusion…" : "Fusionner…"}
          </button>
        </div>
      </section>

      {confirmation && source && cible && (
        <DialogueConfirmation
          titre="Fusionner ces deux ouvrages ?"
          corps={
            <>
              « {source.libelleDevis} » sera désactivé et ses lignes rejoignent
              « {cible.libelleDevis} ». Les statistiques sont recalculées.
            </>
          }
          libelleConfirmer="Fusionner"
          ton="danger"
          enCours={enCours}
          confirmer={fusionner}
          fermer={() => setConfirmation(false)}
        />
      )}
    </div>
  );
}
