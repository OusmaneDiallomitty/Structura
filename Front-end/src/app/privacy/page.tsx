"use client";

import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
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

export default function PrivacyPage() {
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
            <div className="h-10 w-10 rounded-xl bg-green-600 flex items-center justify-center">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Politique de Confidentialité</h1>
              <p className="text-sm text-gray-500">Dernière mise à jour : {LAST_UPDATED}</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 bg-green-50 border border-green-100 rounded-lg px-4 py-3">
            {APP_NAME} s&apos;engage à protéger la confidentialité de vos données. Cette politique explique
            quelles données nous collectons, pourquoi, et comment nous les protégeons.
          </p>
        </div>

        {/* Contenu */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 space-y-8">

          <Section title="1. Responsable du traitement">
            <p>
              Le responsable du traitement des données collectées via {APP_NAME} est l&apos;équipe {APP_NAME},
              éditrice de la plateforme accessible sur <strong>structura.app</strong>.
            </p>
            <p>
              Pour toute question relative à vos données personnelles, contactez-nous à :{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">{CONTACT_EMAIL}</a>
            </p>
          </Section>

          <Section title="2. Données collectées">
            <p>Nous collectons uniquement les données nécessaires au fonctionnement du service :</p>

            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-semibold text-gray-800 mb-2">Données du compte directeur</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Nom, prénom, adresse email</li>
                  <li>Nom et informations de l&apos;établissement scolaire</li>
                  <li>Mot de passe (stocké chiffré, jamais en clair)</li>
                  <li>Date de création du compte et dernière connexion</li>
                </ul>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-semibold text-gray-800 mb-2">Données scolaires (saisies par l&apos;établissement)</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Informations des élèves : nom, prénom, date de naissance, classe, matricule</li>
                  <li>Présences et absences</li>
                  <li>Notes et bulletins scolaires</li>
                  <li>Paiements de scolarité</li>
                  <li>Informations des membres du personnel (enseignants, secrétaires, etc.)</li>
                </ul>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-semibold text-gray-800 mb-2">Données techniques</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Adresse IP (pour la sécurité et la prévention des abus)</li>
                  <li>Logs de connexion et d&apos;activité</li>
                  <li>Type de navigateur et système d&apos;exploitation</li>
                </ul>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-semibold text-gray-800 mb-2">Données de paiement (abonnements)</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Numéro de téléphone mobile (pour Orange Money / MTN MoMo)</li>
                  <li>Historique des transactions d&apos;abonnement</li>
                  <li>Les données de carte bancaire sont traitées directement par Djomy — nous ne les stockons pas</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section title="3. Finalités du traitement">
            <p>Vos données sont utilisées exclusivement pour :</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Fournir et améliorer le service {APP_NAME}</li>
              <li>Gérer votre compte et authentifier vos accès</li>
              <li>Traiter les paiements d&apos;abonnement</li>
              <li>Envoyer des notifications importantes (expiration d&apos;abonnement, alertes)</li>
              <li>Assurer la sécurité et prévenir les abus</li>
              <li>Respecter nos obligations légales</li>
            </ul>
            <p>
              Nous n&apos;utilisons <strong>jamais</strong> vos données scolaires (élèves, notes, paiements)
              à des fins commerciales, publicitaires ou d&apos;analyse de marché.
            </p>
          </Section>

          <Section title="4. Base légale du traitement">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Exécution du contrat</strong> : traitement nécessaire à la fourniture du service</li>
              <li><strong>Consentement</strong> : pour les communications marketing (si vous y avez consenti)</li>
              <li><strong>Intérêt légitime</strong> : sécurité, prévention des fraudes, amélioration du service</li>
              <li><strong>Obligation légale</strong> : conservation des données de facturation</li>
            </ul>
          </Section>

          <Section title="5. Données des élèves mineurs">
            <p>
              {APP_NAME} traite des données relatives à des élèves, dont certains peuvent être mineurs.
              Ces données sont considérées comme <strong>sensibles</strong>.
            </p>
            <p>
              L&apos;établissement scolaire (le directeur) est responsable d&apos;obtenir les consentements
              nécessaires des parents ou tuteurs légaux avant de saisir des informations sur des élèves mineurs,
              conformément aux lois applicables dans son pays.
            </p>
            <p>
              {APP_NAME} agit en qualité de <strong>sous-traitant</strong> et traite ces données uniquement
              selon les instructions de l&apos;établissement.
            </p>
          </Section>

          <Section title="6. Partage des données">
            <p>Nous ne vendons jamais vos données. Nous pouvons les partager uniquement avec :</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Djomy</strong> : prestataire de paiement mobile, pour traiter les abonnements
              </li>
              <li>
                <strong>Brevo</strong> : service d&apos;envoi d&apos;emails transactionnels (notifications, invitations)
              </li>
              <li>
                <strong>Hébergeur cloud</strong> : pour stocker les données de façon sécurisée
              </li>
              <li>
                <strong>Autorités légales</strong> : uniquement si requis par la loi applicable
              </li>
            </ul>
            <p>
              Tous nos sous-traitants sont sélectionnés pour leurs garanties de sécurité et sont liés
              par des accords de confidentialité.
            </p>
          </Section>

          <Section title="7. Durée de conservation">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Données du compte actif</strong> : conservées pendant toute la durée d&apos;utilisation
                du service
              </li>
              <li>
                <strong>Après résiliation du compte</strong> : les données sont conservées 30 jours puis
                définitivement supprimées, sauf obligation légale contraire
              </li>
              <li>
                <strong>Données de facturation</strong> : conservées 5 ans (obligation fiscale)
              </li>
              <li>
                <strong>Logs de sécurité</strong> : conservés 90 jours
              </li>
            </ul>
          </Section>

          <Section title="8. Sécurité des données">
            <p>Nous mettons en œuvre des mesures techniques et organisationnelles pour protéger vos données :</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Chiffrement des données en transit (HTTPS/TLS)</li>
              <li>Mots de passe stockés en hachage bcrypt (jamais en clair)</li>
              <li>Authentification par jetons JWT à durée limitée</li>
              <li>Isolation stricte des données entre établissements (architecture multi-tenant)</li>
              <li>Accès aux données limité au personnel autorisé</li>
              <li>Surveillance et alertes en cas d&apos;activité suspecte</li>
            </ul>
          </Section>

          <Section title="9. Vos droits">
            <p>Conformément aux lois applicables sur la protection des données, vous disposez des droits suivants :</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Droit d&apos;accès</strong> : obtenir une copie de vos données personnelles</li>
              <li><strong>Droit de rectification</strong> : corriger des données inexactes</li>
              <li><strong>Droit à l&apos;effacement</strong> : demander la suppression de vos données</li>
              <li><strong>Droit à la portabilité</strong> : recevoir vos données dans un format structuré</li>
              <li><strong>Droit d&apos;opposition</strong> : vous opposer à certains traitements</li>
            </ul>
            <p>
              Pour exercer ces droits, contactez-nous à :{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">{CONTACT_EMAIL}</a>.
              Nous répondrons dans un délai de 30 jours.
            </p>
          </Section>

          <Section title="10. Cookies et stockage local">
            <p>
              {APP_NAME} utilise le stockage local du navigateur (localStorage / IndexedDB) pour :
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Maintenir votre session de connexion (jeton JWT)</li>
              <li>Mémoriser vos préférences d&apos;affichage</li>
              <li>Stocker les données en mode hors ligne (IndexedDB)</li>
            </ul>
            <p>
              Nous n&apos;utilisons <strong>pas de cookies publicitaires</strong> ni de traceurs tiers à
              des fins marketing. Aucune donnée n&apos;est partagée avec des régies publicitaires.
            </p>
          </Section>

          <Section title="11. Transferts internationaux">
            <p>
              Vos données sont hébergées sur des serveurs situés en Europe ou en Afrique. En cas de
              transfert vers un pays tiers, nous nous assurons que des garanties appropriées sont en place
              (clauses contractuelles types ou niveau de protection adéquat reconnu).
            </p>
          </Section>

          <Section title="12. Modifications de cette politique">
            <p>
              Nous pouvons mettre à jour cette politique de confidentialité. Vous serez informé par email
              au moins <strong>15 jours avant</strong> l&apos;entrée en vigueur des modifications.
              La date de dernière mise à jour est indiquée en haut de cette page.
            </p>
          </Section>

          <Section title="13. Contact et réclamations">
            <p>
              Pour toute question relative à vos données personnelles ou pour exercer vos droits, contactez
              notre équipe à :{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline font-medium">
                {CONTACT_EMAIL}
              </a>
            </p>
            <p>
              Si vous estimez que vos droits ne sont pas respectés, vous avez la possibilité de saisir
              l&apos;autorité de protection des données compétente dans votre pays.
            </p>
          </Section>

        </div>

        {/* Navigation bas */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <Link href="/terms" className="text-blue-600 hover:underline">
            Voir les Conditions Générales d&apos;Utilisation
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
