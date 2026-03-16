"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Building2,
  Shield,
  Users,
  BarChart3,
  CheckCircle2,
  ArrowRight,
  Zap,
  Globe,
  Lock,
  Smartphone,
  TrendingUp,
  FileText,
  DollarSign,
  Calendar,
  Settings,
  PlayCircle,
  X,
  Sparkles,
  Target,
  Award,
  Layers,
} from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { Logo } from "@/components/ui/Logo";
import { EnhancedNavigation } from "@/components/layout/EnhancedNavigation";
import { TypewriterText } from "@/components/animations/TypewriterText";
import { MagneticButton } from "@/components/animations/MagneticButton";
import { GlowOrb } from "@/components/animations/GlowOrb";
import { HeroParticles } from "@/components/hero/HeroParticles";
import { HeroGradient } from "@/components/hero/HeroGradient";
import { FloatingElements } from "@/components/hero/FloatingElements";
import { IsometricDashboard } from "@/components/hero/IsometricDashboard";
import { ScrollReveal } from "@/components/animations/ScrollReveal";
import { TiltCard } from "@/components/animations/TiltCard";
import { BeamCard } from "@/components/animations/BeamCard";
import { CountUp } from "@/components/animations/CountUp";
import { GradientSpotlight } from "@/components/animations/GradientSpotlight";
import { ShimmerText } from "@/components/animations/ShimmerText";
import { fadeInLeft, fadeInRight, blurFadeIn, staggerContainerSlow } from "@/lib/animation-variants";

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

export default function Home() {
  const router = useRouter();
  const heroRef = useRef(null);
  const featuresRef = useRef(null);
  const [demoOpen, setDemoOpen] = useState(false);

  const heroInView = useInView(heroRef, { once: true, amount: 0.3 });
  const featuresInView = useInView(featuresRef, { once: true, amount: 0.2 });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modal démo vidéo */}
      {demoOpen && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setDemoOpen(false)}
        >
          <div
            className="relative w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl bg-black"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setDemoOpen(false)}
              className="absolute top-3 right-3 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full w-9 h-9 flex items-center justify-center transition-colors"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
            <iframe
              src="https://www.youtube.com/embed/YY7fbMwMefs?autoplay=1&rel=0"
              title="Comment s'inscrire sur Structura"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full aspect-video"
            />
          </div>
        </div>
      )}

      {/* Enhanced Navigation */}
      <EnhancedNavigation />

      {/* Hero Section - Premium Version */}
      <section ref={heroRef} className="relative bg-white pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden min-h-screen flex items-center">
        {/* Background Effects - Ultra-simplified for maximum performance */}
        {/* Static gradient only - all animations disabled for performance */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/30 via-purple-50/20 to-pink-50/30 -z-10" />

        {/* All heavy animations disabled for smooth 60fps */}
        {/* <HeroGradient /> */}
        {/* <HeroParticles count={20} /> */}
        {/* <GlowOrb color="rgba(99, 102, 241, 0.2)" size={250} blur={60} x="10%" y="20%" delay={0} duration={15} /> */}
        {/* <FloatingElements /> */}

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            initial="hidden"
            animate={heroInView ? "visible" : "hidden"}
            variants={staggerContainer}
            className="max-w-5xl mx-auto text-center space-y-8"
          >
            {/* Heading - Simplified for performance */}
            <motion.div variants={fadeInUp}>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 leading-tight">
                <span className="block">
                  Gérez votre organisation
                </span>
                <span className="block mt-2">
                  avec{" "}
                  <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                    confiance
                  </span>
                </span>
              </h1>
            </motion.div>

            {/* Description */}
            <motion.p
              variants={fadeInUp}
              className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed"
            >
              La plateforme tout-en-un pour écoles, commerces, ONG et petites entreprises.
              Gérez vos données, suivez vos opérations et travaillez efficacement.
              Sans compétences techniques requises.
            </motion.p>

            {/* CTA Buttons with Magnetic Effect */}
            <motion.div
              variants={fadeInUp}
              className="flex flex-col sm:flex-row gap-4 justify-center items-center"
            >
              <MagneticButton
                strength={0.3}
                radius={60}
                onClick={() => router.push("/register")}
              >
                <Button
                  size="lg"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white h-14 px-10 text-base shadow-lg"
                >
                  Commencer gratuitement
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </MagneticButton>
              <MagneticButton
                strength={0.2}
                radius={50}
                onClick={() => setDemoOpen(true)}
              >
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 px-10 text-base border-gray-300 hover:border-indigo-300 hover:bg-indigo-50"
                >
                  <PlayCircle className="mr-2 h-5 w-5" />
                  Voir la démo
                </Button>
              </MagneticButton>
            </motion.div>
          </motion.div>

          {/* 3D Isometric Dashboard */}
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate={heroInView ? "visible" : "hidden"}
            className="mt-16"
          >
            <IsometricDashboard />
          </motion.div>
        </div>
      </section>

      {/* Modern Management Section */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <p className="text-sm text-gray-500 uppercase tracking-wide mb-4">TRANSFORMATION</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                <ShimmerText>Le passage à une gestion moderne</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-2 gap-8 items-center max-w-6xl mx-auto">
            {/* Left Side - Benefits */}
            <motion.div
              className="space-y-6"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={staggerContainerSlow}
            >
              <motion.div className="flex items-start gap-4" variants={fadeInLeft}>
                <motion.div
                  className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                >
                  <Sparkles className="h-5 w-5 text-red-600" />
                </motion.div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">L'expérience utilisateur</h3>
                  <p className="text-gray-600 text-sm">
                    Interface intuitive et moderne conçue pour être utilisée par tous, sans formation technique.
                  </p>
                </div>
              </motion.div>

              <motion.div className="flex items-start gap-4" variants={fadeInLeft}>
                <motion.div
                  className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                >
                  <Target className="h-5 w-5 text-blue-600" />
                </motion.div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Productivité maximale</h3>
                  <p className="text-gray-600 text-sm">
                    Automatisez vos tâches répétitives et concentrez-vous sur l'essentiel de votre activité.
                  </p>
                </div>
              </motion.div>

              <motion.div className="flex items-start gap-4" variants={fadeInLeft}>
                <motion.div
                  className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                >
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </motion.div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Fiabilité garantie</h3>
                  <p className="text-gray-600 text-sm">
                    Vos données sont sécurisées et sauvegardées automatiquement. Disponibilité <CountUp end={99.9} decimals={1} suffix="%" className="font-semibold" />.
                  </p>
                </div>
              </motion.div>
            </motion.div>

            {/* Right Side - Dark Card with 3D Tilt */}
            <ScrollReveal variant={fadeInRight}>
              <TiltCard maxTilt={5} scale={1.02}>
                <Card className="bg-gradient-to-br from-indigo-900 to-indigo-800 border-0 text-white shadow-2xl">
              <CardContent className="p-8 space-y-6">
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold">Logiciel de gestion</h3>
                  <p className="text-indigo-200">
                    Tout ce dont vous avez besoin pour gérer votre organisation efficacement
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-700 flex items-center justify-center">
                      <Users className="h-4 w-4" />
                    </div>
                    <span className="text-sm">Gestion des membres et contacts</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-700 flex items-center justify-center">
                      <DollarSign className="h-4 w-4" />
                    </div>
                    <span className="text-sm">Suivi financier et facturation</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-700 flex items-center justify-center">
                      <BarChart3 className="h-4 w-4" />
                    </div>
                    <span className="text-sm">Rapports et statistiques en temps réel</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-700 flex items-center justify-center">
                      <FileText className="h-4 w-4" />
                    </div>
                    <span className="text-sm">Documents PDF automatiques</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TiltCard>
        </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Solutions Section */}
      <section id="solutions" className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <p className="text-sm text-gray-500 uppercase tracking-wide mb-4">SOLUTIONS</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Tous dédiés vers la réussite
              </h2>
            </div>
          </ScrollReveal>

          <motion.div
            className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={staggerContainer}
          >
            {/* Écoles */}
            <ScrollReveal variant={blurFadeIn}>
              <TiltCard maxTilt={8} scale={1.03}>
                <Card className="border-2 hover:border-blue-300 transition-all hover:shadow-xl h-full">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto">
                  <Building2 className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Écoles avec profit</h3>
                <p className="text-gray-600 text-sm">
                  Gérez élèves, classes, notes, présences et paiements dans un seul espace centralisé.
                </p>
              </CardContent>
            </Card>
          </TiltCard>
        </ScrollReveal>

            {/* Commerces */}
            <ScrollReveal variant={blurFadeIn} delay={0.1}>
              <TiltCard maxTilt={8} scale={1.03}>
                <Card className="border-2 hover:border-emerald-300 transition-all hover:shadow-xl h-full">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto">
                  <TrendingUp className="h-8 w-8 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Revenus en croissance</h3>
                <p className="text-gray-600 text-sm">
                  Suivez vos ventes, stocks, clients et finances pour développer votre commerce.
                </p>
              </CardContent>
            </Card>
          </TiltCard>
        </ScrollReveal>

            {/* ONG */}
            <ScrollReveal variant={blurFadeIn} delay={0.2}>
              <TiltCard maxTilt={8} scale={1.03}>
                <Card className="border-2 hover:border-violet-300 transition-all hover:shadow-xl h-full">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto">
                  <Award className="h-8 w-8 text-violet-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Missions de l'impact</h3>
                <p className="text-gray-600 text-sm">
                  Gérez vos projets, bénéficiaires, dons et rapports d'activité efficacement.
                </p>
              </CardContent>
            </Card>
          </TiltCard>
        </ScrollReveal>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section ref={featuresRef} id="features" className="py-16 md:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <p className="text-sm text-gray-500 uppercase tracking-wide mb-4">FONCTIONNALITÉS</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Concevez vos besoins spécifiques
              </h2>
            </div>
          </ScrollReveal>

          <motion.div
            initial="hidden"
            animate={featuresInView ? "visible" : "hidden"}
            variants={staggerContainer}
            className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto"
          >
            {/* Feature 1 */}
            <motion.div variants={fadeInUp}>
              <BeamCard className="h-full" beamColor="rgba(59, 130, 246, 0.3)">
                <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow h-full">
                <CardContent className="p-8 space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Layers className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">
                    Tout-en-un et tout-en-ligne
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Centralisez toutes vos données et opérations dans un seul espace accessible partout, à tout moment.
                  </p>
                </CardContent>
              </Card>
            </BeamCard>
            </motion.div>

            {/* Feature 2 */}
            <motion.div variants={fadeInUp}>
              <BeamCard className="h-full" beamColor="rgba(16, 185, 129, 0.3)">
                <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow h-full">
                <CardContent className="p-8 space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <Zap className="h-6 w-6 text-emerald-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">
                    Rapide et automatisé
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Automatisez vos tâches répétitives et gagnez un temps précieux pour vous concentrer sur l'essentiel.
                  </p>
                </CardContent>
              </Card>
            </BeamCard>
            </motion.div>

            {/* Feature 3 */}
            <motion.div variants={fadeInUp}>
              <BeamCard className="h-full" beamColor="rgba(139, 92, 246, 0.3)">
                <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow h-full">
                <CardContent className="p-8 space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
                    <Globe className="h-6 w-6 text-violet-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">
                    100% accessible
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Aucune compétence technique requise. Interface simple et intuitive pour tous les utilisateurs.
                  </p>
                </CardContent>
              </Card>
            </BeamCard>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-0 text-white max-w-5xl mx-auto">
            <CardContent className="p-8 md:p-12">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                {/* Left - Icon */}
                <div className="flex justify-center md:justify-start">
                  <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
                    <Shield className="h-12 w-12 text-white" />
                  </div>
                </div>

                {/* Right - Content */}
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-bold mb-3">
                      Protection de classe entreprise
                    </h2>
                    <p className="text-gray-300">
                      Vos données sont protégées avec les mêmes standards de sécurité que les grandes entreprises internationales.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <Lock className="h-5 w-5 text-indigo-400" />
                      <span className="text-sm">Cryptage SSL</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-indigo-400" />
                      <span className="text-sm">Sauvegarde auto</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-indigo-400" />
                      <span className="text-sm">99.9% uptime</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-5 w-5 text-indigo-400" />
                      <span className="text-sm">Support 24/7</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Prêt à transformer votre organisation ?
            </h2>
            <p className="text-lg text-gray-600">
              Rejoignez des centaines d'écoles, commerces, ONG et entreprises qui utilisent {APP_NAME} pour simplifier leur gestion quotidienne.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                onClick={() => router.push("/register")}
                className="bg-indigo-600 hover:bg-indigo-700 text-white h-12 px-8"
              >
                Commencer gratuitement
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => router.push("/contact")}
                className="h-12 px-8 border-gray-300"
              >
                Contacter l'équipe
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-4 gap-8">
            {/* Brand */}
            <div className="space-y-4">
              <Logo variant="dark" size="sm" />
              <p className="text-sm text-gray-600">
                La plateforme tout-en-un pour gérer votre organisation facilement.
              </p>
              <div className="flex gap-3">
                <a href="#" className="text-gray-400 hover:text-gray-600">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-gray-600">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-gray-600">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121L7.773 13.98l-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.954z"/></svg>
                </a>
              </div>
            </div>

            {/* Product */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-4">Produit</h3>
              <ul className="space-y-3 text-sm text-gray-600">
                <li><a href="/#features" className="hover:text-gray-900">Fonctionnalités</a></li>
                <li><a href="/tarifs" className="hover:text-gray-900">Tarifs</a></li>
                <li><a href="/#security" className="hover:text-gray-900">Sécurité</a></li>
                <li><a href="/register" className="hover:text-gray-900">Commencer gratuitement</a></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-4">Entreprise</h3>
              <ul className="space-y-3 text-sm text-gray-600">
                <li><a href="#" className="hover:text-gray-900">À propos</a></li>
                <li><a href="#" className="hover:text-gray-900">Blog</a></li>
                <li><a href="#" className="hover:text-gray-900">Carrières</a></li>
                <li><a href="/contact" className="hover:text-gray-900">Contact</a></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-4">Légal</h3>
              <ul className="space-y-3 text-sm text-gray-600">
                <li><a href="/privacy" className="hover:text-gray-900">Confidentialité</a></li>
                <li><a href="/terms" className="hover:text-gray-900">Conditions d&apos;utilisation</a></li>
                <li><a href="/contact" className="hover:text-gray-900">Nous contacter</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-200 mt-12 pt-8 text-center text-sm text-gray-600">
            <p>© 2026 {APP_NAME}. Tous droits réservés. Fait avec ❤️ en Guinée 🇬🇳</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
