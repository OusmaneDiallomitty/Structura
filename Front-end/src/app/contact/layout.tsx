import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact — Structura",
  description:
    "Contactez l'équipe Structura pour toute question sur notre logiciel de gestion scolaire et commerciale. Support disponible pour les écoles et commerces en Guinée et en Afrique.",
  openGraph: {
    title: "Contactez Structura",
    description:
      "Une question sur notre logiciel de gestion scolaire ? Notre équipe est là pour vous aider.",
    url: "https://www.structurasaas.com/contact",
  },
  alternates: {
    canonical: "https://www.structurasaas.com/contact",
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
