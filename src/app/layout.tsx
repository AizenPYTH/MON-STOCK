import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";
import { siteUrl } from "@/lib/site";
import { ThemeScript } from "@/components/ui/theme-script";
import "./globals.css";

/** Manrope (OFL, fichiers dans ./fonts) : 300 pour les grands chiffres, 500–800 pour le texte (charte v5). */
const manrope = localFont({
  src: [
    { path: "./fonts/Manrope_300Light.ttf", weight: "300", style: "normal" },
    { path: "./fonts/Manrope_500Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/Manrope_600SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/Manrope_700Bold.ttf", weight: "700", style: "normal" },
    { path: "./fonts/Manrope_800ExtraBold.ttf", weight: "800", style: "normal" },
  ],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "MON STOCK", template: "%s · MON STOCK" },
  description: "Stock, ventes eBay et sourcing fournisseurs pour les revendeurs de téléphones et pièces détachées.",
  applicationName: "MON STOCK",
  openGraph: { type: "website", locale: "fr_FR", siteName: "MON STOCK" },
};

export const viewport: Viewport = { themeColor: "#101C2C" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning : ThemeScript pose `data-theme` sur <html> avant l'hydratation (préférence enregistrée).
    <html lang="fr" className={`${manrope.variable} ${GeistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
