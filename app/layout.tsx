import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Polices du design system Sodobat : Geist (interface, titres, chiffres),
// Geist Mono (codes, numéros de pièce, identifiants).
const geist = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
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
      className={`${geist.variable} ${geistMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
