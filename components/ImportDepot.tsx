"use client";

// =====================================================================
// Dépôt multi-fichiers de l'écran /import : file de traitement locale,
// envoi séquentiel (un fichier à la fois), statut visible par fichier.
// =====================================================================

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  importerFichierAction,
  rafraichirAgregatsAction,
} from "@/lib/actions/import";
import type { BilanFichier } from "@/lib/extraction/pipeline";

type StatutLocal = "en_attente" | "traitement" | "insere" | "doublon" | "erreur";

type FichierEnFile = {
  cle: string;
  fichier: File;
  statut: StatutLocal;
  bilan?: BilanFichier;
  erreur?: string;
};

const EXTENSIONS = [".pdf", ".xls", ".xlsx", ".ods"];

function accepte(nom: string): boolean {
  const minuscule = nom.toLowerCase();
  return EXTENSIONS.some((e) => minuscule.endsWith(e));
}

export function ImportDepot() {
  const router = useRouter();
  const [file, setFile] = useState<FichierEnFile[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [survol, setSurvol] = useState(false);
  const [erreurAgregats, setErreurAgregats] = useState<string | null>(null);
  const [recalculEnCours, demarrerRecalcul] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<FichierEnFile[]>([]);

  const majFichier = (cle: string, champs: Partial<FichierEnFile>) => {
    fileRef.current = fileRef.current.map((f) =>
      f.cle === cle ? { ...f, ...champs } : f,
    );
    setFile([...fileRef.current]);
  };

  const traiterFile = useCallback(async () => {
    setEnCours(true);
    for (const entree of fileRef.current) {
      if (entree.statut !== "en_attente") continue;
      majFichier(entree.cle, { statut: "traitement" });
      try {
        const donnees = new FormData();
        donnees.append("fichier", entree.fichier);
        const bilan = await importerFichierAction(donnees);
        majFichier(entree.cle, {
          statut: bilan.statut,
          bilan,
          erreur: bilan.erreur,
        });
      } catch (e) {
        majFichier(entree.cle, {
          statut: "erreur",
          erreur: e instanceof Error ? e.message : String(e),
        });
      }
    }
    try {
      await rafraichirAgregatsAction();
      setErreurAgregats(null);
    } catch (e) {
      setErreurAgregats(e instanceof Error ? e.message : String(e));
    }
    setEnCours(false);
    router.refresh();
  }, [router]);

  const ajouter = useCallback(
    (fichiers: FileList | File[]) => {
      const nouveaux: FichierEnFile[] = Array.from(fichiers)
        .filter((f) => accepte(f.name))
        .map((f) => ({
          cle: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
          fichier: f,
          statut: "en_attente" as const,
        }));
      const refuses = Array.from(fichiers).filter((f) => !accepte(f.name));
      const refusesEnFile: FichierEnFile[] = refuses.map((f) => ({
        cle: `${f.name}-${f.size}-refus-${Math.random()}`,
        fichier: f,
        statut: "erreur" as const,
        erreur: "Format non pris en charge (pdf, xls, xlsx, ods).",
      }));
      fileRef.current = [...fileRef.current, ...nouveaux, ...refusesEnFile];
      setFile([...fileRef.current]);
      if (nouveaux.length > 0 && !enCours) void traiterFile();
    },
    [enCours, traiterFile],
  );

  const badge = (f: FichierEnFile) => {
    switch (f.statut) {
      case "en_attente":
        return <span className="badge b-neutre">en attente</span>;
      case "traitement":
        return <span className="badge b-amber">extraction…</span>;
      case "doublon":
        return <span className="badge b-neutre">doublon</span>;
      case "erreur":
        return <span className="badge b-red">échec</span>;
      case "insere":
        return f.bilan?.statutDocument === "valide" ? (
          <span className="badge b-green">inséré · validé</span>
        ) : (
          <span className="badge b-amber">inséré · à revoir</span>
        );
    }
  };

  const recalculer = () => {
    demarrerRecalcul(async () => {
      try {
        await rafraichirAgregatsAction();
        setErreurAgregats(null);
        router.refresh();
      } catch (e) {
        setErreurAgregats(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <section>
      {erreurAgregats && (
        <div className="vx-insight vx-insight--warn mb-3 flex flex-wrap items-center gap-3 !py-3 text-[13.5px]">
          <span>
            Pièces importées, mais les prix n&apos;ont pas été recalculés : {erreurAgregats}
          </span>
          <button type="button" disabled={recalculEnCours} onClick={recalculer} className="vx-btn-outline ml-auto !py-1.5">
            {recalculEnCours ? "Recalcul…" : "Recalculer les prix"}
          </button>
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          ajouter(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-[10px] border border-dashed px-6 py-10 text-center transition-colors ${
          survol
            ? "border-navy bg-navy-tint"
            : "border-navy-line bg-surface-sunken hover:border-navy hover:bg-navy-tint"
        }`}
      >
        <span className="text-[15px] font-semibold text-navy-deep">
          Déposez les devis ici, ou cliquez pour choisir
        </span>
        <span className="text-[13px] text-sub">
          PDF, XLS, XLSX, ODS — traitement séquentiel, extraction par IA puis
          contrôles arithmétiques
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={EXTENSIONS.join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) ajouter(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {file.length > 0 && (
        <ul className="mt-4 border-t border-line">
          {file.map((f) => (
            <li
              key={f.cle}
              className="flex flex-wrap items-center gap-3 border-b border-hairline px-1 py-2.5 text-[14px]"
            >
              <span className="max-w-[420px] truncate font-medium">
                {f.fichier.name}
              </span>
              <span className="mono text-[12px] text-faint">
                {(f.fichier.size / 1024).toFixed(0)} Ko
              </span>
              <span className="ml-auto flex items-center gap-2">
                {f.bilan?.nbLignes != null && (
                  <span className="mono text-[12.5px] text-sub">
                    {f.bilan.nbLignes} lignes
                    {f.bilan.nbLignesEcart ? ` · ${f.bilan.nbLignesEcart} écart(s)` : ""}
                    {f.bilan.ouvragesCrees
                      ? ` · ${f.bilan.ouvragesCrees} ouvrage(s) créé(s)`
                      : ""}
                  </span>
                )}
                {badge(f)}
              </span>
              {f.erreur && (
                <p className="w-full text-[12.5px] text-red">{f.erreur}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
