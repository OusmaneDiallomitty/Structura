import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/layout/Providers";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.structurasaas.com"),
  title: {
    default: "Structura — Logiciel de Gestion Scolaire en Guinée et en Afrique",
    template: "%s | Structura",
  },
  description:
    "Structura est le logiciel de gestion scolaire en ligne pour les écoles en Guinée et en Afrique. Gérez les élèves, paiements de scolarité, présences, notes et bulletins depuis n'importe quel appareil.",
  keywords: [
    "logiciel gestion scolaire Guinée",
    "application gestion école Afrique",
    "gestion scolaire en ligne",
    "logiciel école Conakry",
    "suivi élèves Guinée",
    "paiements scolarité en ligne",
    "bulletins scolaires numériques",
    "logiciel présences élèves",
    "gestion notes élèves",
    "SaaS école Afrique de l'Ouest",
    "logiciel administration scolaire",
    "plateforme éducative Guinée",
    "logiciel caisse commerce Guinée",
    "gestion boutique Afrique",
    "Structura",
  ],
  authors: [{ name: "Structura", url: "https://www.structurasaas.com" }],
  creator: "Structura",
  publisher: "Structura",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
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
    locale: "fr_GN",
    url: "https://www.structurasaas.com",
    siteName: "Structura",
    title: "Structura — Logiciel de Gestion Scolaire en Guinée et en Afrique",
    description:
      "Gérez votre école facilement depuis n'importe quel appareil : élèves, paiements de scolarité, présences, notes et bulletins. Essai gratuit disponible.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Structura — Logiciel de Gestion Scolaire",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Structura — Logiciel de Gestion Scolaire en Guinée",
    description:
      "Gérez votre école facilement : élèves, paiements, présences, notes et bulletins. Essai gratuit disponible.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: "https://www.structurasaas.com",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.structurasaas.com/#organization",
      "name": "Structura",
      "url": "https://www.structurasaas.com",
      "logo": "https://www.structurasaas.com/logo.png",
      "description": "Logiciel de gestion scolaire et commerciale en ligne pour les écoles et commerces en Guinée et en Afrique.",
      "foundingLocation": { "@type": "Place", "name": "Guinée" },
      "areaServed": ["Guinée", "Afrique de l'Ouest", "Afrique"],
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "customer service",
        "availableLanguage": "French",
        "url": "https://www.structurasaas.com/contact",
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.structurasaas.com/#software",
      "name": "Structura",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web, Android, iOS",
      "url": "https://www.structurasaas.com",
      "description": "Logiciel de gestion scolaire : suivi des élèves, paiements de scolarité, présences, notes et bulletins. Aussi disponible pour la gestion de commerces et boutiques.",
      "offers": [
        {
          "@type": "Offer",
          "name": "Plan Gratuit",
          "price": "0",
          "priceCurrency": "GNF",
        },
        {
          "@type": "Offer",
          "name": "Plan Pro",
          "price": "50000",
          "priceCurrency": "GNF",
        },
      ],
      "provider": { "@id": "https://www.structurasaas.com/#organization" },
    },
    {
      "@type": "WebSite",
      "@id": "https://www.structurasaas.com/#website",
      "url": "https://www.structurasaas.com",
      "name": "Structura",
      "publisher": { "@id": "https://www.structurasaas.com/#organization" },
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://www.structurasaas.com/?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
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
