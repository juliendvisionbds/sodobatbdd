// =====================================================================
// /chat — assistant. Outils typés côté serveur, aucune donnée inventée.
// =====================================================================

import { EnTete } from "@/components/EnTete";
import { ChatPanneau } from "@/components/ChatPanneau";
import { TitrePage } from "@/components/Vision";

export const dynamic = "force-dynamic";

export default function PageChat() {
  return (
    <div className="min-h-screen">
      <EnTete actif="chat" />
      <main className="vx-wrap pb-16 pt-[30px]">
        <TitrePage
          titre="Demandez comme à un métreur."
          chapo="Plus besoin de fouiller les tableaux Excel : posez la question en français, l'assistant interroge la base et répond avec le prix, le nombre d'occurrences et la période."
        />
        <ChatPanneau />
      </main>
    </div>
  );
}
