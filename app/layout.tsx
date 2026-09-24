import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Polices du design system Vision : Space Grotesk (titres, chiffres
// vedettes), IBM Plex Sans (texte), IBM Plex Mono (montants).
const grotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-grotesk",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Sodobat — Prix d'ouvrages",
  description:
    "Base de données intelligente des prix d'ouvrages Sodobat : tableau des prix, fiches, historique des devis et assistant.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // variables de police sur <html> : les tokens de :root les lisent
    <html
      lang="fr"
      className={`${grotesk.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
