import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/layout/Providers";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Structura — Gestion Scolaire",
    template: "%s | Structura",
  },
  description:
    "Structura est une plateforme SaaS de gestion scolaire : suivi des élèves, paiements de scolarité, présences, notes, bulletins et proclamation des résultats.",
  keywords: [
    "gestion scolaire",
    "école",
    "plateforme scolaire",
    "suivi élèves",
    "paiements scolarité",
    "bulletins scolaires",
    "logiciel école Guinée",
    "SaaS éducation",
  ],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/logo-icon.svg", type: "image/svg+xml" },
      { url: "/logo.png",      type: "image/png", sizes: "192x192" },
    ],
    apple: [
      { url: "/logo-icon.svg" },
    ],
    shortcut: "/logo.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Structura",
  },
  openGraph: {
    type: "website",
    siteName: "Structura",
    title: "Structura — Gestion Scolaire",
    description:
      "Gérez votre école facilement : élèves, paiements, présences, notes et bulletins. Plateforme multi-tenant sécurisée.",
    images: [
      {
        url: "/logo-icon.svg",
        width: 300,
        height: 300,
        alt: "Structura — Gestion Scolaire",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Structura — Gestion Scolaire",
    description:
      "Gérez votre école facilement : élèves, paiements, présences, notes et bulletins.",
    images: ["/logo-icon.svg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <Providers>
          {children}
          <Toaster position="top-right" richColors />
          <ServiceWorkerRegistration />
        </Providers>
      </body>
    </html>
  );
}
