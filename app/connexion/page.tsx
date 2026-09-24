import { Suspense } from "react";
import Image from "next/image";
import { FormulaireConnexion } from "./formulaire";

export const metadata = { title: "Connexion — Sodobat" };

export default async function PageConnexion({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>;
}) {
  const { suite } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center gap-3">
          <Image
            src="/sodobat.jpeg"
            alt="Sodobat"
            width={46}
            height={46}
            priority
            className="h-[46px] w-[46px] shrink-0 rounded-[9px] object-cover"
          />
          <div>
            <div className="vx-brand__title">Base de données intelligente</div>
            <div className="vx-brand__sub">Sodobat · prix d&apos;ouvrages</div>
          </div>
        </div>
        <div className="vx-panel">
          <h1 className="vx-panel__title">Accès à la base.</h1>
          <p className="vx-panel__desc mb-5 mt-1">
            Saisissez le code d&apos;accès qui vous a été remis.
          </p>
          <Suspense>
            <FormulaireConnexion suite={suite ?? "/"} />
          </Suspense>
        </div>
        <p className="mt-4 text-center text-[12.5px] text-faint">
          Un code par personne, remis par la direction.
        </p>
      </div>
    </main>
  );
}
