"use client";

// =====================================================================
// Panneau de l'assistant : messages, streaming NDJSON, activité des
// outils pendant l'exécution (repliée ensuite), sources sous chaque
// réponse avec bouton « Voir dans le tableau ».
// =====================================================================

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Source {
  ouvrageId: string;
  libelle: string;
  n: number;
  periode: string;
  filtres: string | null;
}

interface MessageChat {
  role: "user" | "assistant";
  contenu: string;
  sources?: Source[];
  activites?: string[];
  enCours?: boolean;
  erreur?: string;
}

const SUGGESTIONS: Array<{ question: string; indice: string }> = [
  { question: "Prix moyen d'un IPN 160 posé", indice: "Prix médian, fourchette et nombre d'occurrences" },
  {
    question: "Compare les prix normaux et TS sur la charpente métallique",
    indice: "Écart travaux normaux / supplémentaires",
  },
  {
    question: "Tous les devis de la copropriété Croix du Sud",
    indice: "Recherche dans l'historique des pièces",
  },
];

// rendu markdown minimal : tableaux, gras, listes. Pas de bibliothèque.
function RenduTexte({ texte }: { texte: string }) {
  const blocs = texte.split(/\n\n+/);
  return (
    <div className="flex flex-col gap-2">
      {blocs.map((bloc, i) => {
        const lignes = bloc.split("\n");
        const estTableau =
          lignes.length >= 2 &&
          lignes[0].trim().startsWith("|") &&
          /^\|?[\s:|-]+\|?$/.test(lignes[1].trim());
        if (estTableau) {
          const entetes = decouperRang(lignes[0]);
          const corps = lignes.slice(2).map(decouperRang);
          return (
            <div key={i} className="overflow-x-auto">
              <table className="border-collapse text-[13px]">
                <thead>
                  <tr>
                    {entetes.map((c, j) => (
                      <th
                        key={j}
                        className="border-b border-navy-line px-2 py-1.5 text-left text-[12px] font-semibold uppercase tracking-[.04em] text-navy"
                      >
                        <EnLigne texte={c} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {corps.map((rang, j) => (
                    <tr key={j}>
                      {rang.map((c, k) => (
                        <td
                          key={k}
                          className={`border-b border-navy-tint-border px-2 py-1.5 ${
                            /^[\d\s,.€%/-]+$/.test(c.trim()) ? "mono text-right font-medium" : ""
                          }`}
                        >
                          <EnLigne texte={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const estListe = lignes.every((l) => /^\s*[-•]\s/.test(l));
        if (estListe) {
          return (
            <ul key={i} className="ml-4 list-disc">
              {lignes.map((l, j) => (
                <li key={j}>
                  <EnLigne texte={l.replace(/^\s*[-•]\s/, "")} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            <EnLigne texte={bloc} />
          </p>
        );
      })}
    </div>
  );
}

function decouperRang(ligne: string): string[] {
  return ligne
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

function EnLigne({ texte }: { texte: string }) {
  const morceaux = texte.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {morceaux.map((m, i) =>
        m.startsWith("**") && m.endsWith("**") ? (
          <strong key={i}>{m.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{m}</span>
        ),
      )}
    </>
  );
}

export function ChatPanneau() {
  const [messages, setMessages] = useState<MessageChat[]>([]);
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const filRef = useRef<HTMLDivElement>(null);
  const champRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => champRef.current?.focus({ preventScroll: true }), []);
  // défile le fil seul, jamais la page
  useEffect(() => {
    const fil = filRef.current;
    if (fil) fil.scrollTop = fil.scrollHeight;
  }, [messages]);

  const envoyer = async (texte: string) => {
    const question = texte.trim();
    if (!question || enCours) return;
    setSaisie("");
    setEnCours(true);

    const precedents = messages
      .filter((m) => !m.erreur)
      .map((m) => ({ role: m.role, contenu: m.contenu }));

    setMessages((ms) => [
      ...ms,
      { role: "user", contenu: question },
      { role: "assistant", contenu: "", enCours: true, activites: [] },
    ]);

    const majDernier = (maj: (m: MessageChat) => MessageChat) =>
      setMessages((ms) => [...ms.slice(0, -1), maj(ms[ms.length - 1])]);

    try {
      const reponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...precedents, { role: "user", contenu: question }],
        }),
      });

      if (!reponse.ok || !reponse.body) {
        const detail = await reponse.json().catch(() => null);
        majDernier((m) => ({
          ...m,
          enCours: false,
          erreur:
            (detail?.erreur as string) ??
            "La base n'a pas répondu. Réessayer.",
        }));
        return;
      }

      const lecteur = reponse.body.getReader();
      const decodeur = new TextDecoder();
      let tampon = "";

      for (;;) {
        const { done, value } = await lecteur.read();
        if (done) break;
        tampon += decodeur.decode(value, { stream: true });
        const lignes = tampon.split("\n");
        tampon = lignes.pop() ?? "";
        for (const ligne of lignes) {
          if (!ligne.trim()) continue;
          const ev = JSON.parse(ligne) as Record<string, unknown>;
          if (ev.type === "texte") {
            majDernier((m) => ({
              ...m,
              contenu: m.contenu + String(ev.texte),
            }));
          } else if (ev.type === "outil" && ev.etat === "debut") {
            majDernier((m) => ({
              ...m,
              activites: [...(m.activites ?? []), String(ev.libelle)],
            }));
          } else if (ev.type === "sources") {
            majDernier((m) => ({ ...m, sources: ev.sources as Source[] }));
          } else if (ev.type === "erreur") {
            majDernier((m) => ({
              ...m,
              enCours: false,
              erreur: String(ev.message),
            }));
          }
        }
      }
      majDernier((m) => ({ ...m, enCours: false, activites: [] }));
    } catch {
      majDernier((m) => ({
        ...m,
        enCours: false,
        erreur: "La base n'a pas répondu. Réessayer.",
      }));
    } finally {
      setEnCours(false);
      champRef.current?.focus();
    }
  };

  return (
    <div className="grid items-start gap-[22px] lg:grid-cols-[minmax(0,1fr)_330px]">
      <section className="vx-chat">
        <div className="vx-chat__head">
          <span>Assistant IA · base de prix</span>
          <span className="vx-live">Répond depuis vos pièces</span>
        </div>

        {/* ---------- fil ---------- */}
        <div
          ref={filRef}
          className="vx-chat__thread h-[min(60vh,620px)] min-h-[360px] overflow-y-auto"
        >
          <div className="vx-bubble">
            Posez une question comme à un métreur. Chaque prix cité vient
            de la base, avec son nombre d&apos;occurrences et sa période.
            Jamais d&apos;estimation.
          </div>

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="vx-bubble vx-bubble--user">
                {m.contenu}
              </div>
            ) : (
              <div key={i} className="vx-bubble !max-w-[92%]">
                {/* activité des outils, visible pendant l'exécution */}
                {m.enCours && (m.activites?.length ?? 0) > 0 && (
                  <p className="mb-2 flex items-center gap-2 text-[12.5px] text-sub">
                    <span className="vx-banner__dot !h-1.5 !w-1.5" aria-hidden />
                    {m.activites![m.activites!.length - 1]}
                  </p>
                )}
                {m.contenu && <RenduTexte texte={m.contenu} />}
                {m.enCours && !m.contenu && (m.activites?.length ?? 0) === 0 && (
                  <p className="flex items-center gap-2 text-[12.5px] text-sub">
                    <span className="vx-banner__dot !h-1.5 !w-1.5" aria-hidden />
                    Lecture de la base…
                  </p>
                )}
                {m.erreur && (
                  <p className="rounded-[8px] border border-red/30 bg-red-bg px-3 py-2 text-[13.5px] text-red">
                    {m.erreur}
                  </p>
                )}
                {/* sources */}
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-3 border-t border-navy-line pt-2.5">
                    {m.sources.map((s, j) => (
                      <p key={j} className="vx-bubble__tail !mt-0 !not-italic">
                        {s.libelle} · n&nbsp;=&nbsp;{s.n}, {s.periode}
                        {s.filtres && <> · {s.filtres}</>}
                      </p>
                    ))}
                    <Link
                      href={`/?ouvrage=${m.sources[0].ouvrageId}`}
                      className="vx-btn-ghost mt-2 inline-block"
                    >
                      Voir dans le tableau →
                    </Link>
                  </div>
                )}
              </div>
            ),
          )}
        </div>

        {/* ---------- saisie ---------- */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            envoyer(saisie);
          }}
          className="vx-chat__composer flex-col !gap-2"
        >
          <div className="flex items-end gap-2.5">
            <textarea
              ref={champRef}
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  envoyer(saisie);
                }
              }}
              rows={2}
              placeholder="Poser une question sur les prix…"
              aria-label="Poser une question sur les prix"
              className="vx-input min-w-0 flex-1 resize-none !text-[15px] placeholder:text-faint"
            />
            <button
              type="submit"
              disabled={enCours || !saisie.trim()}
              className="vx-btn"
            >
              {enCours ? "Recherche…" : "Envoyer"}
            </button>
          </div>
          <p className="text-[12.5px] text-faint">
            Les prix cités sont actualisés à aujourd&apos;hui, sauf demande de
            prix bruts. Entrée pour envoyer, Maj+Entrée pour aller à la ligne.
          </p>
        </form>
      </section>

      {/* ---------- suggestions ---------- */}
      <aside className="vx-panel">
        <h2 className="vx-panel__title">Questions fréquentes</h2>
        <p className="vx-panel__desc mt-1">
          Un clic pose la question. Réponse chiffrée, sources jointes.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.question}
              type="button"
              disabled={enCours}
              onClick={() => envoyer(s.question)}
              className="vx-suggest text-left disabled:opacity-50"
            >
              <div className="vx-suggest__q">{s.question}</div>
              <div className="vx-suggest__hint">{s.indice}</div>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
