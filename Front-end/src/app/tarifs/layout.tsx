import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tarifs — Logiciel de Gestion Scolaire",
  description:
    "Découvrez les tarifs de Structura : plan gratuit, Pro à 50 000 GNF/mois et Pro+ à 150 000 GNF/mois. Logiciel de gestion scolaire et commerciale pour les écoles en Guinée et en Afrique.",
  keywords: [
    "tarifs logiciel gestion scolaire Guinée",
    "prix application école Afrique",
    "abonnement logiciel scolaire gratuit",
    "logiciel école pas cher Guinée",
  ],
  openGraph: {
    title: "Tarifs Structura — Plans et Abonnements",
    description:
      "Plan gratuit disponible. Pro à 50 000 GNF/mois. Gérez votre école ou votre commerce depuis n'importe quel appareil.",
    url: "https://www.structurasaas.com/tarifs",
  },
  alternates: {
    canonical: "https://www.structurasaas.com/tarifs",
  },
};

export default function TarifsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
