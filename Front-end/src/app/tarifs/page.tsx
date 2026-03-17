"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Check, X, Zap, Crown, ChevronDown,
  ArrowRight, Shield, Wifi, Users, FileText,
  BarChart3, Download, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { APP_NAME } from "@/lib/constants";
import { EnhancedNavigation } from "@/components/layout/EnhancedNavigation";
import { Logo } from "@/components/ui/Logo";

// ─── Données plans ────────────────────────────────────────────────────────────

const PLANS = [
  {
    key:         "FREE",
    name:        "Gratuit",
    icon:        null,
    color:       "gray",
    monthlyGNF:  0,
    annualGNF:   0,
    maxUsers:    "2 utilisateurs",
    description: "Pour démarrer sans risque. Tout ce qu'il faut pour gérer votre école au quotidien.",
    cta:         "Commencer gratuitement",
    ctaHref:     "/register",
    highlighted: false,
    badge:       null,
  },
  {
    key:         "PRO",
    name:        "Pro",
    icon:        Zap,
    color:       "indigo",
    monthlyGNF:  50_000,
    annualGNF:   450_000,
    maxUsers:    "5 utilisateurs",
    description: "Bulletins PDF, reçus officiels, import/export et équipe jusqu'à 5 membres.",
    cta:         "Passer au Pro",
    ctaHref:     "/register?plan=PRO",
    highlighted: false,
    badge:       "Le plus choisi",
  },
  {
    key:         "PRO_PLUS",
    name:        "Pro+",
    icon:        Crown,
    color:       "purple",
    monthlyGNF:  100_000,
    annualGNF:   900_000,
    maxUsers:    "Équipe illimitée",
    description: "Tout le Pro + logo école sur PDF, bulletins en masse, rapports avancés et équipe illimitée.",
    cta:         "Passer au Pro+",
    ctaHref:     "/register?plan=PRO_PLUS",
    highlighted: true,
    badge:       "Complet",
  },
] as const;

// ─── Tableau comparatif ───────────────────────────────────────────────────────

interface FeatureRow {
  category: string;
  icon:     React.ElementType;
  features: { label: string; free: boolean | string; pro: boolean | string; proPlus: boolean | string }[];
}

const FEATURE_TABLE: FeatureRow[] = [
  {
    category: "Gestion des données",
    icon:     Users,
    features: [
      { label: "Élèves",   free: "Illimité", pro: "Illimité", proPlus: "Illimité" },
      { label: "Classes",  free: "Illimité", pro: "Illimité", proPlus: "Illimité" },
      { label: "Utilisateurs", free: "2 max", pro: "5 max",   proPlus: "Illimité" },
    ],
  },
  {
    category: "Fonctionnalités quotidiennes",
    icon:     Shield,
    features: [
      { label: "Suivi des présences",       free: true,  pro: true,  proPlus: true  },
      { label: "Suivi des paiements",       free: true,  pro: true,  proPlus: true  },
      { label: "Saisie des notes",          free: true,  pro: true,  proPlus: true  },
      { label: "Mode offline complet",      free: true,  pro: true,  proPlus: true  },
      { label: "Plusieurs années scolaires", free: false, pro: true,  proPlus: true  },
    ],
  },
  {
    category: "Documents PDF",
    icon:     FileText,
    features: [
      { label: "Reçus de paiement PDF",        free: false, pro: true,  proPlus: true  },
      { label: "Bulletins PDF individuels",     free: false, pro: true,  proPlus: true  },
      { label: "Logo école sur les PDF",        free: false, pro: false, proPlus: true  },
      { label: "Bulletins en masse (ZIP)",      free: false, pro: false, proPlus: true  },
    ],
  },
  {
    category: "Import / Export",
    icon:     Download,
    features: [
      { label: "Export CSV des données",     free: false, pro: true,  proPlus: true  },
      { label: "Import CSV élèves",          free: false, pro: true,  proPlus: true  },
    ],
  },
  {
    category: "Rapports & Analytics",
    icon:     BarChart3,
    features: [
      { label: "Statistiques de base",       free: true,  pro: true,  proPlus: true  },
      { label: "Rapports financiers avancés", free: false, pro: false, proPlus: true  },
    ],
  },
  {
    category: "Communication",
    icon:     Globe,
    features: [
      { label: "Notifications email parents", free: false, pro: false, proPlus: true },
    ],
  },
];

// ─── FAQ ─────────────────────────────────────────────────────────────────────

const FAQ = [
  {
    q: "Puis-je commencer gratuitement sans carte bancaire ?",
    a: "Oui. Le plan Gratuit ne nécessite aucune carte bancaire. Vous pouvez l'utiliser sans limite de durée.",
  },
  {
    q: "Comment fonctionne le paiement ?",
    a: "Les paiements s'effectuent via Djomy (Orange Money, MTN MoMo ou carte bancaire). Vous êtes débité mensuellement ou annuellement selon votre choix. Votre plan est activé instantanément après confirmation du paiement.",
  },
  {
    q: "Que se passe-t-il si j'atteins la limite de 2 utilisateurs en Gratuit ?",
    a: "Vous pouvez continuer à utiliser l'application avec vos 2 utilisateurs. Pour ajouter un 3ème membre, passez au plan Pro qui permet jusqu'à 5 utilisateurs.",
  },
  {
    q: "Le mode offline fonctionne-t-il sur tous les plans ?",
    a: "Oui. Le mode offline est disponible sur tous les plans, y compris le Gratuit. C'est essentiel pour travailler sans coupures de connexion.",
  },
  {
    q: "Puis-je changer de plan à tout moment ?",
    a: "Oui. Vous pouvez passer à un plan supérieur à tout moment depuis votre espace abonnement. Le changement est immédiat.",
  },
  {
    q: "Mes données sont-elles sécurisées ?",
    a: "Vos données sont chiffrées, sauvegardées automatiquement et isolées par école. Aucune donnée n'est partagée entre établissements.",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatGNF(amount: number): string {
  if (amount === 0) return "Gratuit";
  return new Intl.NumberFormat("fr-GN", {
    style:                 "currency",
    currency:              "GNF",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function FeatureCell({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="text-sm font-medium text-gray-700">{value}</span>;
  }
  return value
    ? <Check className="w-5 h-5 text-emerald-500 mx-auto" />
    : <X    className="w-5 h-5 text-gray-300 mx-auto"     />;
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function TarifsPage() {
  const [annual, setAnnual]         = useState(false);
  const [openFaq, setOpenFaq]       = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-white">

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <EnhancedNavigation />

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="pt-28 pb-16 px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto space-y-6"
        >
          <Badge variant="outline" className="text-indigo-600 border-indigo-200 bg-indigo-50 px-4 py-1 text-sm">
            Tarifs transparents
          </Badge>

          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight">
            Le bon plan pour votre{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              établissement
            </span>
          </h1>

          <p className="text-lg text-gray-600 max-w-xl mx-auto">
            Commencez gratuitement, sans carte bancaire. Passez au Pro quand vous en avez besoin.
            Paiement via Orange Money, MTN MoMo ou carte bancaire.
          </p>

          {/* Toggle mensuel / annuel */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <span className={`text-sm font-medium ${!annual ? "text-gray-900" : "text-gray-400"}`}>
              Mensuel
            </span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${
                annual ? "bg-indigo-600" : "bg-gray-200"
              }`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                annual ? "translate-x-6" : "translate-x-0"
              }`} />
            </button>
            <span className={`text-sm font-medium flex items-center gap-2 flex-wrap justify-center ${annual ? "text-gray-900" : "text-gray-400"}`}>
              Annuel
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
                Économisez 2–3 mois
              </span>
            </span>
          </div>
        </motion.div>
      </section>

      {/* ── Cards plans ─────────────────────────────────────────────────────── */}
      <section className="pb-20 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => {
              const Icon  = plan.icon;
              const price = annual ? plan.annualGNF : plan.monthlyGNF;

              return (
                <motion.div
                  key={plan.key}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className={`relative rounded-2xl border p-6 flex flex-col gap-5 ${
                    plan.highlighted
                      ? "border-purple-300 bg-gradient-to-b from-purple-50 to-white shadow-xl shadow-purple-100 ring-2 ring-purple-300"
                      : "border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow"
                  }`}
                >
                  {/* Badge */}
                  {plan.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${
                        plan.highlighted ? "bg-purple-600" : "bg-indigo-600"
                      }`}>
                        {plan.badge}
                      </span>
                    </div>
                  )}

                  {/* Header plan */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      {Icon && (
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          plan.highlighted ? "bg-purple-100" : "bg-indigo-100"
                        }`}>
                          <Icon className={`w-4 h-4 ${plan.highlighted ? "text-purple-600" : "text-indigo-600"}`} />
                        </div>
                      )}
                      <span className="font-semibold text-gray-900 text-lg">{plan.name}</span>
                    </div>
                    <p className="text-sm text-gray-500">{plan.description}</p>
                  </div>

                  {/* Prix */}
                  <div>
                    {plan.monthlyGNF === 0 ? (
                      <div>
                        <span className="text-3xl font-bold text-gray-900">Gratuit</span>
                        <p className="text-xs text-gray-400 mt-0.5">Pour toujours · Aucune carte requise</p>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-bold text-gray-900">{formatGNF(price)}</span>
                          <span className="text-gray-400 text-sm">/{annual ? "an" : "mois"}</span>
                        </div>
                        {annual ? (
                          <p className="text-xs text-gray-400 mt-0.5">
                            soit {formatGNF(Math.round(price / 12))}/mois
                            <span className="ml-2 text-emerald-600 font-medium">
                              {plan.key === "PRO" ? "· 2 mois offerts" : "· 3 mois offerts"}
                            </span>
                          </p>
                        ) : (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {formatGNF(plan.annualGNF)}/an avec la facturation annuelle
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Users */}
                  <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                    <Users className="w-4 h-4 text-gray-400" />
                    {plan.maxUsers}
                  </div>

                  {/* CTA */}
                  <Link href={plan.ctaHref} className="mt-auto">
                    <Button
                      className={`w-full ${
                        plan.highlighted
                          ? "bg-purple-600 hover:bg-purple-700 text-white"
                          : plan.key === "FREE"
                          ? "bg-gray-900 hover:bg-gray-800 text-white"
                          : "bg-indigo-600 hover:bg-indigo-700 text-white"
                      }`}
                      size="lg"
                    >
                      {plan.cta}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </motion.div>
              );
            })}
          </div>

          {/* Déjà inscrit */}
          <p className="text-center text-sm text-gray-500 mt-6">
            Vous avez déjà un compte ?{" "}
            <Link href="/login" className="text-indigo-600 hover:underline font-medium">
              Connectez-vous pour gérer votre abonnement
            </Link>
          </p>
        </div>
      </section>

      {/* ── Tableau comparatif ───────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="container mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Comparez les fonctionnalités</h2>
            <p className="text-gray-500">Tout ce qui est inclus dans chaque plan</p>
          </motion.div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-120">
                {/* En-tête tableau */}
                <div className="grid grid-cols-4 border-b border-gray-100 bg-gray-50/80">
                  <div className="p-4 col-span-1" />
                  {["Gratuit", "Pro", "Pro+"].map((name) => (
                    <div key={name} className="p-4 text-center">
                      <span className="font-semibold text-gray-900 text-sm">{name}</span>
                    </div>
                  ))}
                </div>

                {/* Lignes de features */}
                {FEATURE_TABLE.map((section, si) => (
                  <div key={si}>
                    {/* Catégorie */}
                    <div className="grid grid-cols-4 bg-gray-50/50 border-b border-gray-100">
                      <div className="p-3 col-span-4 flex items-center gap-2">
                        <section.icon className="w-4 h-4 text-gray-400" />
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          {section.category}
                        </span>
                      </div>
                    </div>

                    {section.features.map((feat, fi) => (
                      <div
                        key={fi}
                        className={`grid grid-cols-4 border-b border-gray-50 ${
                          fi % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                        }`}
                      >
                        <div className="p-3 pl-4 text-sm text-gray-700 flex items-center">
                          {feat.label}
                        </div>
                        <div className="p-3 flex items-center justify-center">
                          <FeatureCell value={feat.free} />
                        </div>
                        <div className="p-3 flex items-center justify-center">
                          <FeatureCell value={feat.pro} />
                        </div>
                        <div className="p-3 flex items-center justify-center">
                          <FeatureCell value={feat.proPlus} />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

                {/* Footer tableau — CTAs */}
                <div className="grid grid-cols-4 p-4 gap-3 bg-gray-50/80">
                  <div />
                  {PLANS.map((plan) => (
                    <Link key={plan.key} href={plan.ctaHref}>
                      <Button
                        variant={plan.highlighted ? "default" : "outline"}
                        className={`w-full text-xs ${plan.highlighted ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                      >
                        {plan.cta}
                      </Button>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Points de réassurance ────────────────────────────────────────────── */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="grid sm:grid-cols-3 gap-8 text-center">
            {[
              {
                icon:  Wifi,
                title: "100% Offline",
                desc:  "Travaillez sans connexion internet. Vos données se synchronisent automatiquement quand vous êtes en ligne.",
              },
              {
                icon:  Shield,
                title: "Données sécurisées",
                desc:  "Chaque école a ses données complètement isolées. Chiffrement de bout en bout.",
              },
              {
                icon:  Users,
                title: "Support inclus",
                desc:  "Assistance par email incluse dans tous les plans. Réponse sous 24h.",
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="space-y-3"
              >
                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mx-auto">
                  <item.icon className="w-6 h-6 text-indigo-600" />
                </div>
                <h3 className="font-semibold text-gray-900">{item.title}</h3>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="container mx-auto max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Questions fréquentes</h2>
            <p className="text-gray-500">Tout ce que vous devez savoir avant de commencer</p>
          </motion.div>

          <div className="space-y-3">
            {FAQ.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-medium text-gray-900 pr-4">{item.q}</span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${
                    openFaq === i ? "rotate-180" : ""
                  }`} />
                </button>
                {openFaq === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="px-5 pb-5"
                  >
                    <p className="text-sm text-gray-600 leading-relaxed">{item.a}</p>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA final ───────────────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-10 text-white space-y-6"
          >
            <h2 className="text-3xl font-bold">
              Prêt à moderniser votre école ?
            </h2>
            <p className="text-indigo-100 max-w-md mx-auto">
              Rejoignez les établissements qui font confiance à Structura. Commencez gratuitement, sans engagement.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/register">
                <Button size="lg" className="bg-white text-indigo-600 hover:bg-indigo-50 font-semibold w-full sm:w-auto">
                  Commencer gratuitement
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/login" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto bg-transparent border border-white/60 text-white hover:bg-white/15">
                  Déjà inscrit ? Se connecter
                </Button>
              </Link>
            </div>
            <p className="text-xs text-indigo-200">
              Aucune carte bancaire requise · Annulation à tout moment · Support inclus
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-200 py-10 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link href="/">
              <Logo variant="dark" size="sm" />
            </Link>
            <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500">
              <Link href="/"        className="hover:text-gray-900 transition-colors">Accueil</Link>
              <Link href="/#features" className="hover:text-gray-900 transition-colors">Fonctionnalités</Link>
              <Link href="/tarifs"  className="text-indigo-600 font-medium">Tarifs</Link>
              <Link href="/login"   className="hover:text-gray-900 transition-colors">Connexion</Link>
              <Link href="/register" className="hover:text-gray-900 transition-colors">S'inscrire</Link>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-gray-100 text-center text-xs text-gray-400">
            © {new Date().getFullYear()} {APP_NAME} — Tous droits réservés
          </div>
        </div>
      </footer>

    </div>
  );
}
