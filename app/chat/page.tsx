// =====================================================================
// /chat — assistant. Outils typés côté serveur, aucune donnée inventée.
// =====================================================================

import { referentiel } from "@/lib/queries";
import { EnTete } from "@/components/EnTete";
import { EtatBase } from "@/components/EtatBase";
import { ChatPanneau } from "@/components/ChatPanneau";
import { TitrePage } from "@/components/Vision";

export const dynamic = "force-dynamic";

export default async function PageChat() {
  const synthese = await referentiel.synthese();
  return (
    <div className="min-h-screen">
      <EnTete actif="chat" synthese={synthese} />
      <main className="vx-wrap pb-16 pt-7">
        <TitrePage
          titre="Demandez comme à un métreur."
          chapo="Plus besoin de fouiller les tableaux Excel : posez la question en français, l'assistant interroge la base et répond avec le prix, le nombre d'occurrences et la période."
          meta={<EtatBase synthese={synthese} />}
        />
        <ChatPanneau />
      </main>
    </div>
  );
}
