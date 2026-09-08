import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ÉniEvent — Organisez vos événements au Bénin",
    template: "%s | ÉniEvent",
  },
  description:
    "Réservez salles, traiteurs, décorateurs, maîtres de cérémonie et matériel événementiel à Cotonou, Porto-Novo, Abomey-Calavi et partout au Bénin. Réservation immédiate ou demande de devis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${inter.variable} font-sans`}>{children}</body>
    </html>
  );
}
