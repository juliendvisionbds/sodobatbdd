"use client";

// =====================================================================
// File de calage ligne à ligne — tout au clavier : V valider, M modifier
// la cible, N créer un ouvrage, → passer, Z annuler le dernier geste.
// Après chaque action, la ligne suivante s'affiche immédiatement.
// =====================================================================

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  annulerDerniereActionAction,
  validerRattachementAction,
} from "@/lib/actions/calage";
import {
  date as fmtDate,
  nombre,
  LIBELLES_UNITES,
  LIBELLES_ZONES,
  type RattachementAValider,
} from "@/lib/types";
import { BadgeStatutDocument } from "./BadgeStatutDocument";
import { BandeauAction, type DernierGeste } from "./BandeauAction";
import { ComboboxOuvrage } from "./ComboboxOuvrage";
import { FormulaireNouvelOuvrage } from "./FormulaireNouvelOuvrage";

type Superposition = "aucune" | "modifier" | "nouveau";

export function CalageFile({
  lot,
  lots,
  total,
}: {
  lot: RattachementAValider[];
  lots: Array<{ id: string; code: string; libelle: string }>;
  /** total en attente (au-delà de la page chargée) */
  total?: number;
}) {
  const router = useRouter();
  const [file, setFile] = useState(lot);
  const [superposition, setSuperposition] = useState<Superposition>("aucune");
  const [geste, setGeste] = useState<DernierGeste | null>(null);
  const [enCours, demarrer] = useTransition();

  useEffect(() => setFile(lot), [lot]);

  const courant = file[0] ?? null;

  const avancer = useCallback(() => {
    setSuperposition("aucune");
    setFile((f) => {
      const suivante = f.slice(1);
      if (suivante.length === 0) router.refresh();
      return suivante;
    });
  }, [router]);

  const valider = useCallback(
    (ouvrageId?: string, libelle?: string) => {
      if (!courant || enCours) return;
      demarrer(async () => {
        await validerRattachementAction(courant.id, ouvrageId);
        setGeste({
          message: `« ${courant.ligne.designationBrute.slice(0, 60)} » validée vers « ${libelle ?? courant.ouvragePropose.libelleDevis} »`,
          n: 1,
        });
        avancer();
      });
    },
    [courant, enCours, avancer],
  );

  const annuler = useCallback(() => {
    if (enCours) return;
    demarrer(async () => {
      await annulerDerniereActionAction();
      setGeste(null);
      router.refresh();
    });
  }, [enCours, router]);

  // ---------- raccourcis ----------
  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => {
      if (superposition !== "aucune") return;
      const cible = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName)) return;
      if (!courant) return;
      const touche = e.key.toLowerCase();
      if (touche === "v") {
        e.preventDefault();
        valider();
      } else if (touche === "m") {
        e.preventDefault();
        setSuperposition("modifier");
      } else if (touche === "n") {
        e.preventDefault();
        setSuperposition("nouveau");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setFile((f) => (f.length > 1 ? [...f.slice(1), f[0]] : f));
      }
    };
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
  }, [courant, superposition, valider]);

  if (!courant) {
    return (
      <div>
        <BandeauAction geste={geste} enCours={enCours} annuler={annuler} effacer={() => setGeste(null)} />
        <p className="vx-panel py-16 text-center text-[15px] text-sub">
          File vide : tous les rattachements sont validés.
        </p>
      </div>
    );
  }

  const l = courant.ligne;
  const o = courant.ouvragePropose;

  return (
    <div>
      <BandeauAction geste={geste} enCours={enCours} annuler={annuler} effacer={() => setGeste(null)} />
      <p className="vx-panel__meta mb-3">
        {total != null && total > file.length
          ? `${file.length} chargés sur ${total} en attente`
          : `${file.length} rattachement${file.length > 1 ? "s" : ""} dans la file`}
        {enCours && " · enregistrement…"}
      </p>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[12px] border border-line bg-line md:grid-cols-2">
        {/* ---------- ligne source ---------- */}
        <section className="bg-surface p-6">
          <h2 className="vx-table__group mb-3 !p-0">Ligne source</h2>
          <p className="text-[15px] leading-snug">
            «&nbsp;{l.designationBrute}&nbsp;»
          </p>
          <p className="mono mt-3 text-[13px]">
            {l.unite ? LIBELLES_UNITES[l.unite] : (l.uniteBrute ?? "—")} ·{" "}
            {nombre(l.quantite)} · {nombre(l.pu)}&nbsp;€
            {l.estTs && (
              <span className="badge b-amber ml-2">
                TS
              </span>
            )}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-sub">
            <span>
              {l.numeroDocument ?? "Pièce"} · {fmtDate(l.date)}
              {l.client && <> · {l.client}</>}
            </span>
            <BadgeStatutDocument statut={courant.statutDocument} controleLigne={courant.controleLigne} />
            {l.lienPdf && (
              <a href={l.lienPdf} target="_blank" rel="noreferrer" className="font-semibold text-navy underline-offset-2 hover:underline">
                Pièce d&apos;origine ↗
              </a>
            )}
          </p>
          {l.zone && (
            <p className="text-[12px] text-sub">
              {LIBELLES_ZONES[l.zone]}
              {!l.zoneFiable && (
                <span className="badge b-amber ml-1.5">zone déduite</span>
              )}
            </p>
          )}
          {Object.keys(l.attributs).length > 0 && (
            <p className="mono mt-2 text-[12px] text-sub">
              {Object.entries(l.attributs)
                .map(([c, v]) => `${c} ${String(v)}`)
                .join(" · ")}
            </p>
          )}
        </section>

        {/* ---------- ouvrage proposé ---------- */}
        <section className="bg-surface p-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="vx-table__group !p-0">Ouvrage proposé</h2>
            <span className="mono text-[12px] text-sub">
              score {courant.score == null ? "—" : nombre(courant.score, 2)}
            </span>
          </div>
          <p className="mono text-[13.5px] font-medium text-navy">{o.code ?? "—"}</p>
          <p className="mt-1 text-[15px] leading-snug">{o.libelleDevis}</p>
          <p className="mt-0.5 text-[12px] text-sub">{o.libelleNormalise}</p>
          <p className="mt-2 text-[12px] text-sub">
            {[o.lotLibelle, o.unite ? LIBELLES_UNITES[o.unite] : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {courant.nbMemeOuvrage > 0 && (
            <p className="mt-2 text-[12.5px]">
              <Link
                href={`/calage?q=${encodeURIComponent(o.libelleDevis)}`}
                className="font-semibold text-navy underline-offset-2 hover:underline"
              >
                {courant.nbMemeOuvrage} autre{courant.nbMemeOuvrage > 1 ? "s" : ""} ligne
                {courant.nbMemeOuvrage > 1 ? "s" : ""} en attente sur cet ouvrage → valider en bloc
              </Link>
            </p>
          )}

          {courant.candidats.length > 0 && (
            <div className="mt-4 border-t border-hairline pt-3">
              <h3 className="cote-label mb-2">Autres candidats</h3>
              {courant.candidats.map((c, i) => (
                <button
                  key={c.ouvrage.id}
                  type="button"
                  onClick={() => valider(c.ouvrage.id, c.ouvrage.libelleDevis)}
                  title={`Valider vers ${c.ouvrage.libelleDevis}`}
                  className="flex w-full items-baseline justify-between gap-2 rounded-[7px] px-2 py-1.5 text-left text-[13.5px] hover:bg-navy-tint"
                >
                  <span className="truncate">
                    <span className="mono mr-2 text-[11px] text-sub">
                      {i + 1}.
                    </span>
                    {c.ouvrage.code ?? c.ouvrage.libelleDevis}
                  </span>
                  <span className="mono text-[12px] text-sub">
                    {nombre(c.score, 2)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ---------- barre d'actions ---------- */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <BoutonAction touche="V" libelle="Valider" surClic={() => valider()} desactive={enCours} />
        <BoutonAction touche="M" libelle="Modifier la cible" surClic={() => setSuperposition("modifier")} desactive={enCours} />
        <BoutonAction touche="N" libelle="Nouvel ouvrage" surClic={() => setSuperposition("nouveau")} desactive={enCours} />
        <BoutonAction
          touche="→"
          libelle="Passer"
          surClic={() => setFile((f) => (f.length > 1 ? [...f.slice(1), f[0]] : f))}
          desactive={enCours}
        />
      </div>

      {superposition === "modifier" && (
        <ComboboxOuvrage
          fermer={() => setSuperposition("aucune")}
          choisir={(ouvrage) => valider(ouvrage.id, ouvrage.libelleDevis)}
        />
      )}
      {superposition === "nouveau" && (
        <FormulaireNouvelOuvrage
          ligneId={l.id}
          designation={l.designationBrute}
          unite={l.unite}
          lots={lots}
          fermer={() => setSuperposition("aucune")}
          apres={() => {
            setGeste({ message: "Ouvrage créé et ligne rattachée", n: 1 });
            avancer();
          }}
        />
      )}
    </div>
  );
}

function BoutonAction({
  touche,
  libelle,
  surClic,
  desactive,
}: {
  touche: string;
  libelle: string;
  surClic: () => void;
  desactive: boolean;
}) {
  return (
    <button
      type="button"
      onClick={surClic}
      disabled={desactive}
      className="vx-btn-outline !gap-2 !py-2"
    >
      <kbd className="mono rounded-[6px] border border-navy-line bg-navy-tint px-1.5 py-0.5 text-[11.5px] text-navy">
        {touche}
      </kbd>
      {libelle}
    </button>
  );
}
