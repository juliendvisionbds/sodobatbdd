"use client";

// Onglet « Doublons » : propositions de fusion d'ouvrages quasi
// identiques. Fusionner demande confirmation (la source est désactivée,
// ses lignes rejoignent la cible ; annulable par Z juste après).

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  annulerDerniereActionAction,
  fusionnerProposeeAction,
  ignorerFusionAction,
} from "@/lib/actions/calage";
import { LIBELLES_UNITES, nombre, type FusionProposee, type Ouvrage } from "@/lib/types";
import { BandeauAction, type DernierGeste } from "./BandeauAction";
import { DialogueConfirmation } from "./Superposee";

function Cote({ o, role }: { o: Ouvrage & { nbLignes: number }; role: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="cote-label mb-1">{role}</div>
      <div className="text-[14.5px] font-semibold leading-snug">{o.libelleDevis}</div>
      <div className="mt-0.5 text-[12.5px] text-sub">
        <span className="mono">{o.code ?? "—"}</span>
        {o.lotCode ? ` · ${o.lotCode}` : ""}
        {o.unite ? ` · ${LIBELLES_UNITES[o.unite]}` : ""}
        {" · "}
        <span className="mono">{o.nbLignes}</span> ligne{o.nbLignes > 1 ? "s" : ""}
      </div>
      <div className="mt-0.5 truncate text-[12px] text-faint" title={o.libelleNormalise}>
        {o.libelleNormalise}
      </div>
    </div>
  );
}

const AVIS: Record<string, { classe: string; libelle: string }> = {
  meme: { classe: "b-green", libelle: "IA : même prestation" },
  incertain: { classe: "b-amber", libelle: "IA : incertain" },
  distinct: { classe: "b-red", libelle: "IA : distinct" },
};

export function CalageDoublons({ fusions: initial }: { fusions: FusionProposee[] }) {
  const router = useRouter();
  const [fusions, setFusions] = useState(initial);
  const [inverses, setInverses] = useState<Set<string>>(new Set());
  const [aConfirmer, setAConfirmer] = useState<FusionProposee | null>(null);
  const [geste, setGeste] = useState<DernierGeste | null>(null);
  const [enCours, demarrer] = useTransition();

  const sens = (f: FusionProposee) =>
    inverses.has(f.id) ? { source: f.cible, cible: f.source } : { source: f.source, cible: f.cible };

  const fusionner = useCallback(() => {
    const f = aConfirmer;
    if (!f) return;
    const { source, cible } = sens(f);
    demarrer(async () => {
      await fusionnerProposeeAction(f.id, inverses.has(f.id));
      setAConfirmer(null);
      setFusions((fs) => fs.filter((x) => x.id !== f.id));
      setGeste({
        message: `« ${source.libelleDevis} » fusionné dans « ${cible.libelleDevis} » (${source.nbLignes} lignes repointées)`,
        n: source.nbLignes,
      });
      router.refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aConfirmer, inverses, router]);

  const ignorer = (f: FusionProposee) =>
    demarrer(async () => {
      await ignorerFusionAction(f.id);
      setFusions((fs) => fs.filter((x) => x.id !== f.id));
      router.refresh();
    });

  const annuler = useCallback(() => {
    if (enCours) return;
    demarrer(async () => {
      await annulerDerniereActionAction();
      setGeste(null);
      router.refresh();
    });
  }, [enCours, router]);

  return (
    <div>
      <BandeauAction geste={geste} enCours={enCours} annuler={annuler} effacer={() => setGeste(null)} />

      {fusions.length === 0 ? (
        <p className="vx-panel py-16 text-center text-[15px] text-sub">
          Aucun doublon proposé pour l&apos;instant.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {fusions.map((f) => {
            const { source, cible } = sens(f);
            const avis = f.avisLlm ? AVIS[f.avisLlm] : null;
            return (
              <article key={f.id} className="vx-panel flex flex-wrap items-center gap-4 !py-4">
                <Cote o={source} role="Source (désactivée)" />
                <span aria-hidden className="text-[20px] text-faint">→</span>
                <Cote o={cible} role="Cible (conserve l'historique)" />
                <div className="flex w-full flex-wrap items-center gap-2 border-t border-hairline pt-3 xl:w-auto xl:border-0 xl:pt-0">
                  <span
                    className="mono text-[12.5px] text-sub"
                    title={f.methode === "embedding" ? "Proximité de sens (embeddings)" : "Similarité des libellés (trigrammes)"}
                  >
                    {f.score == null ? "—" : nombre(f.score, 2)}
                    {f.methode === "embedding" && <span className="badge b-neutre ml-1.5">par sens</span>}
                  </span>
                  {avis && <span className={`badge ${avis.classe}`}>{avis.libelle}</span>}
                  {f.motif && (
                    <span className="max-w-[260px] truncate text-[12.5px] text-sub" title={f.motif}>
                      {f.motif}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() =>
                      setInverses((s) => {
                        const n = new Set(s);
                        if (n.has(f.id)) n.delete(f.id);
                        else n.add(f.id);
                        return n;
                      })
                    }
                    className="vx-btn-ghost"
                    title="Échanger source et cible"
                  >
                    ⇄ Inverser
                  </button>
                  <button type="button" disabled={enCours} onClick={() => ignorer(f)} className="vx-btn-outline">
                    Ignorer
                  </button>
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() => setAConfirmer(f)}
                    className="vx-btn !px-4 !py-2 !text-[14px]"
                  >
                    Fusionner
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {aConfirmer && (() => {
        const { source, cible } = sens(aConfirmer);
        return (
          <DialogueConfirmation
            titre="Fusionner ces deux ouvrages ?"
            corps={
              <>
                « {source.libelleDevis} » ({source.nbLignes} ligne{source.nbLignes > 1 ? "s" : ""}) sera
                désactivé. Ses lignes rejoignent « {cible.libelleDevis} » ({cible.nbLignes} ligne
                {cible.nbLignes > 1 ? "s" : ""}). Les statistiques sont recalculées. Z annule juste après.
              </>
            }
            libelleConfirmer="Fusionner"
            ton="danger"
            enCours={enCours}
            confirmer={fusionner}
            fermer={() => setAConfirmer(null)}
          />
        );
      })()}
    </div>
  );
}
