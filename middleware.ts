// =====================================================================
// Middleware — tout est protégé sauf /connexion.
// /calage et /import exigent un code marqué administrateur.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESSION, verifierJeton } from "./lib/session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/connexion")) {
    return NextResponse.next();
  }

  const jeton = req.cookies.get(COOKIE_SESSION)?.value;
  const session = jeton ? await verifierJeton(jeton) : null;

  if (!session) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ erreur: "Non authentifié." }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("suite", pathname);
    return NextResponse.redirect(url);
  }

  if (
    (pathname.startsWith("/calage") || pathname.startsWith("/import")) &&
    !session.estAdmin
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "?acces=refuse";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|ico|woff2?)$).*)",
  ],
};
