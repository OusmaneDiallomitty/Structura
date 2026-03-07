"use client";

import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

const LAST_UPDATED = "1er mars 2026";
const CONTACT_EMAIL = "support@structura.app";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-2">{title}</h2>
      <div className="text-gray-700 space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="container mx-auto max-w-4xl px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Retour à l&apos;accueil
          </Link>
          <span className="text-sm font-semibold text-gray-900">{APP_NAME}</span>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-4 py-12">
        {/* Titre */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Conditions Générales d&apos;Utilisation</h1>
              <p className="text-sm text-gray-500">Dernière mise à jour : {LAST_UPDATED}</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
            En utilisant {APP_NAME}, vous acceptez les présentes conditions. Lisez-les attentivement avant de créer un compte.
          </p>
        </div>

        {/* Contenu */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 space-y-8">

          <Section title="1. Présentation du service">
            <p>
              <strong>{APP_NAME}</strong> est une plateforme SaaS (Software as a Service) de gestion scolaire éditée
              et exploitée par l&apos;équipe {APP_NAME}. Le service est accessible via le site web{" "}
              <strong>structura.app</strong> et permet aux établissements scolaires de gérer les élèves, les classes,
              les présences, les notes, les paiements de scolarité et les membres du personnel.
            </p>
            <p>
              Le service est destiné aux établissements scolaires d&apos;Afrique francophone (Guinée, Sénégal,
              Côte d&apos;Ivoire, Mali, Cameroun, Burkina Faso, Togo, Bénin, Niger, Mauritanie et autres pays
              francophones).
            </p>
          </Section>

          <Section title="2. Acceptation des conditions">
            <p>
              L&apos;utilisation de {APP_NAME} implique l&apos;acceptation pleine et entière des présentes
              conditions générales d&apos;utilisation (CGU). Ces conditions s&apos;appliquent à toute personne
              qui crée un compte ou utilise le service, qu&apos;elle soit directeur, enseignant, comptable,
              secrétaire ou surveillant.
            </p>
            <p>
              Pour créer un compte directeur, vous devez avoir au moins <strong>18 ans</strong> et être
              habilitée à représenter votre établissement scolaire.
            </p>
          </Section>

          <Section title="3. Création de compte et accès">
            <p>
              Chaque établissement scolaire correspond à un <strong>compte unique</strong> (tenant) dans
              {APP_NAME}. Le directeur est le responsable principal du compte.
            </p>
            <p>L&apos;utilisateur s&apos;engage à :</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Fournir des informations exactes et à jour lors de l&apos;inscription</li>
              <li>Maintenir la confidentialité de son mot de passe</li>
              <li>Notifier immédiatement {APP_NAME} en cas d&apos;utilisation non autorisée de son compte</li>
              <li>Ne pas partager ses identifiants de connexion avec des tiers non autorisés</li>
            </ul>
            <p>
              {APP_NAME} ne peut être tenu responsable des pertes ou dommages résultant du non-respect de
              ces obligations.
            </p>
          </Section>

          <Section title="4. Plans d'abonnement et paiements">
            <p>{APP_NAME} propose trois plans :</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Plan Gratuit</strong> : accès aux fonctionnalités de base, sans limite de durée</li>
              <li><strong>Plan Pro</strong> : fonctionnalités avancées (bulletins PDF, export CSV, etc.)</li>
              <li><strong>Plan Pro+</strong> : toutes les fonctionnalités, équipe illimitée</li>
            </ul>
            <p>
              Les paiements des abonnements Pro et Pro+ sont traités via <strong>Djomy</strong>, un prestataire
              de paiement mobile (Orange Money, MTN MoMo, carte bancaire). En effectuant un paiement, vous
              acceptez également les conditions de Djomy.
            </p>
            <p>
              Les abonnements sont à <strong>renouvellement non automatique</strong>. Vous recevrez une
              notification avant l&apos;expiration de votre abonnement.
            </p>
            <p>
              <strong>Politique de remboursement :</strong> en cas de problème technique empêchant
              l&apos;accès au service pendant plus de 48h consécutives après paiement, un remboursement
              partiel ou total peut être accordé après examen. Les demandes doivent être adressées à{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">{CONTACT_EMAIL}</a>{" "}
              dans les 7 jours suivant le paiement.
            </p>
          </Section>

          <Section title="5. Utilisation acceptable du service">
            <p>Vous vous engagez à utiliser {APP_NAME} uniquement à des fins légitimes de gestion scolaire.</p>
            <p>Il est strictement interdit de :</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Saisir des données fausses, frauduleuses ou diffamatoires</li>
              <li>Tenter d&apos;accéder aux données d&apos;autres établissements</li>
              <li>Utiliser le service pour des activités illégales</li>
              <li>Reproduire, copier ou revendre le service sans autorisation écrite</li>
              <li>Utiliser des robots, scrapers ou tout outil automatisé pour extraire des données</li>
              <li>Surcharger délibérément les serveurs par des attaques ou des requêtes massives</li>
            </ul>
            <p>
              Le non-respect de ces règles entraîne la suspension immédiate du compte, sans remboursement.
            </p>
          </Section>

          <Section title="6. Données scolaires et responsabilités">
            <p>
              L&apos;établissement scolaire (le directeur) est responsable de la légalité et de l&apos;exactitude
              des données saisies dans {APP_NAME}, notamment les informations personnelles des élèves
              (nom, prénom, date de naissance, classe, notes, présences, paiements).
            </p>
            <p>
              Les données relatives aux élèves mineurs sont des données sensibles. L&apos;établissement
              s&apos;engage à obtenir les autorisations nécessaires des parents ou tuteurs légaux avant
              de saisir ces informations, conformément aux lois applicables dans son pays.
            </p>
            <p>
              {APP_NAME} agit en tant que <strong>sous-traitant</strong> de ces données et s&apos;engage
              à ne pas les utiliser à d&apos;autres fins que la fourniture du service.
            </p>
          </Section>

          <Section title="7. Disponibilité du service">
            <p>
              {APP_NAME} s&apos;efforce d&apos;assurer une disponibilité maximale du service, mais ne garantit
              pas une disponibilité ininterrompue à 100%. Des interruptions peuvent survenir pour maintenance,
              mises à jour ou raisons techniques indépendantes de notre volonté.
            </p>
            <p>
              {APP_NAME} dispose d&apos;un <strong>mode hors ligne</strong> permettant de continuer à travailler
              en cas d&apos;interruption de la connexion Internet. Les données sont synchronisées dès que la
              connexion est rétablie.
            </p>
            <p>
              En cas d&apos;indisponibilité planifiée, les utilisateurs seront notifiés avec un préavis
              raisonnable.
            </p>
          </Section>

          <Section title="8. Propriété intellectuelle">
            <p>
              L&apos;ensemble du service {APP_NAME} (code, design, logo, contenus) est la propriété exclusive
              de l&apos;équipe {APP_NAME} et est protégé par les lois sur la propriété intellectuelle.
            </p>
            <p>
              Les données saisies par l&apos;établissement (élèves, notes, paiements…) restent la
              propriété exclusive de l&apos;établissement. {APP_NAME} ne revendique aucun droit sur ces données.
            </p>
          </Section>

          <Section title="9. Résiliation du compte">
            <p>
              Vous pouvez résilier votre compte à tout moment en contactant le support à{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">{CONTACT_EMAIL}</a>.
              Après résiliation, vos données seront conservées pendant <strong>30 jours</strong> puis
              définitivement supprimées, sauf obligation légale contraire.
            </p>
            <p>
              {APP_NAME} se réserve le droit de suspendre ou résilier un compte en cas de violation des
              présentes CGU, sans préavis ni remboursement.
            </p>
          </Section>

          <Section title="10. Limitation de responsabilité">
            <p>
              Dans les limites permises par la loi applicable, {APP_NAME} ne pourra être tenu responsable
              des dommages indirects, pertes de données ou pertes de revenus résultant de l&apos;utilisation
              ou de l&apos;impossibilité d&apos;utiliser le service.
            </p>
            <p>
              La responsabilité totale de {APP_NAME} est limitée au montant payé par l&apos;utilisateur
              au cours des 3 derniers mois précédant l&apos;événement à l&apos;origine du litige.
            </p>
          </Section>

          <Section title="11. Modifications des conditions">
            <p>
              {APP_NAME} se réserve le droit de modifier les présentes CGU à tout moment. Les utilisateurs
              seront informés par email au moins <strong>15 jours avant</strong> l&apos;entrée en vigueur des
              nouvelles conditions. La poursuite de l&apos;utilisation du service après cette date vaut
              acceptation des nouvelles conditions.
            </p>
          </Section>

          <Section title="12. Droit applicable et litiges">
            <p>
              Les présentes CGU sont soumises au droit applicable dans le pays de l&apos;établissement
              utilisateur. En cas de litige, les parties s&apos;engagent à rechercher en premier lieu une
              solution amiable en contactant le support {APP_NAME}.
            </p>
            <p>
              À défaut d&apos;accord amiable dans un délai de 30 jours, le litige sera soumis à la juridiction
              compétente du pays de l&apos;établissement.
            </p>
          </Section>

          <Section title="13. Contact">
            <p>
              Pour toute question relative aux présentes CGU, contactez-nous à :{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline font-medium">
                {CONTACT_EMAIL}
              </a>
            </p>
          </Section>
        </div>

        {/* Navigation bas */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <Link href="/privacy" className="text-blue-600 hover:underline">
            Voir la Politique de confidentialité
          </Link>
          <Link href="/contact" className="text-blue-600 hover:underline">
            Une question ? Contactez-nous
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-6 px-4 bg-white mt-8">
        <div className="container mx-auto max-w-4xl text-center text-sm text-gray-500">
          <p>© 2026 {APP_NAME}. Tous droits réservés. Fait avec passion pour l&apos;éducation en Afrique.</p>
        </div>
      </footer>
    </div>
  );
}
