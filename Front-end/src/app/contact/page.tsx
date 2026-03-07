"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Mail, Phone, MessageSquare, Send, CheckCircle2,
  Clock, MapPin, ArrowLeft, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_NAME } from "@/lib/constants";
import { EnhancedNavigation } from "@/components/layout/EnhancedNavigation";

const SUBJECTS = [
  "Question sur les fonctionnalités",
  "Problème technique",
  "Facturation / Abonnement",
  "Demande de démo",
  "Partenariat",
  "Autre",
];

const CONTACT_EMAIL = "support@structura.app";
const WHATSAPP_NUMBER = "22400000000"; // A remplacer par le vrai numéro

export default function ContactPage() {
  const [form, setForm] = useState({
    name: "", email: "", phone: "", subject: SUBJECTS[0], message: "",
  });
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) return;
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch(`${API_URL}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message ?? "Erreur lors de l'envoi");
      }
      setStatus("success");
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message ?? "Une erreur est survenue. Contactez-nous par WhatsApp.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <EnhancedNavigation />

      {/* Hero */}
      <section className="pt-28 pb-16 px-4 bg-white border-b border-gray-100">
        <div className="container mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium mb-4">
              <MessageSquare className="h-4 w-4" />
              Nous sommes là pour vous
            </span>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Contactez l&apos;équipe {APP_NAME}
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Une question, un problème ou une demande de démo ?
              Notre équipe répond en moins de 24h.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Contenu principal */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="grid lg:grid-cols-3 gap-10">

            {/* Infos contact */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="space-y-6"
            >
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Nos coordonnées</h2>
                <p className="text-gray-600 text-sm">
                  Choisissez le canal qui vous convient le mieux.
                </p>
              </div>

              {/* Canaux */}
              <div className="space-y-4">
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-4 p-4 bg-green-50 border border-green-200 rounded-xl hover:bg-green-100 transition-colors"
                >
                  <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                    <Phone className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-green-900">WhatsApp</p>
                    <p className="text-sm text-green-700">Canal principal — réponse rapide</p>
                    <p className="text-xs text-green-600 mt-1">Cliquer pour ouvrir WhatsApp</p>
                  </div>
                </a>

                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="flex items-start gap-4 p-4 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors"
                >
                  <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                    <Mail className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-blue-900">Email</p>
                    <p className="text-sm text-blue-700">{CONTACT_EMAIL}</p>
                    <p className="text-xs text-blue-600 mt-1">Réponse sous 24h ouvrées</p>
                  </div>
                </a>

                <div className="flex items-start gap-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
                  <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                    <Clock className="h-5 w-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Horaires support</p>
                    <p className="text-sm text-gray-600">Lundi – Vendredi</p>
                    <p className="text-sm text-gray-600">8h00 – 18h00 (GMT)</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
                  <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                    <MapPin className="h-5 w-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Couverture</p>
                    <p className="text-sm text-gray-600">Afrique francophone</p>
                    <p className="text-xs text-gray-500 mt-1">Guinée · Sénégal · CI · Mali · Cameroun · +</p>
                  </div>
                </div>
              </div>

              {/* FAQ rapide */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="font-semibold text-gray-900 mb-3 text-sm">Questions fréquentes</p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>
                    <Link href="/tarifs" className="text-blue-600 hover:underline">
                      Voir les tarifs et plans
                    </Link>
                  </li>
                  <li>
                    <Link href="/register" className="text-blue-600 hover:underline">
                      Créer un compte gratuitement
                    </Link>
                  </li>
                  <li>
                    <Link href="/terms" className="text-blue-600 hover:underline">
                      Conditions d&apos;utilisation
                    </Link>
                  </li>
                  <li>
                    <Link href="/privacy" className="text-blue-600 hover:underline">
                      Politique de confidentialité
                    </Link>
                  </li>
                </ul>
              </div>
            </motion.div>

            {/* Formulaire */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="lg:col-span-2"
            >
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
                {status === "success" ? (
                  <div className="flex flex-col items-center text-center py-8 gap-4">
                    <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle2 className="h-9 w-9 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        Message envoyé !
                      </h3>
                      <p className="text-gray-600">
                        Merci <strong>{form.name}</strong>. Nous avons bien reçu votre message
                        et vous répondrons sous 24h ouvrées.
                      </p>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <Button
                        variant="outline"
                        onClick={() => { setStatus("idle"); setForm({ name: "", email: "", phone: "", subject: SUBJECTS[0], message: "" }); }}
                      >
                        Nouveau message
                      </Button>
                      <Button asChild>
                        <Link href="/">Retour à l&apos;accueil</Link>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 mb-1">
                        Envoyer un message
                      </h2>
                      <p className="text-sm text-gray-500">
                        Tous les champs marqués * sont obligatoires.
                      </p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="name">Nom complet *</Label>
                        <Input
                          id="name"
                          placeholder="Amadou Diallo"
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          required
                          minLength={2}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="email">Email *</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="directeur@monecole.com"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="phone">Téléphone / WhatsApp</Label>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="+224 622 00 00 00"
                          value={form.phone}
                          onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="subject">Sujet *</Label>
                        <select
                          id="subject"
                          value={form.subject}
                          onChange={(e) => setForm({ ...form, subject: e.target.value })}
                          className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                          required
                        >
                          {SUBJECTS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="message">Message *</Label>
                      <textarea
                        id="message"
                        rows={6}
                        placeholder="Décrivez votre demande en détail..."
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                        required
                        minLength={10}
                        className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary focus:outline-none resize-none"
                      />
                    </div>

                    {status === "error" && (
                      <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                        {errorMsg || "Erreur d'envoi."}{" "}
                        <a
                          href={`https://wa.me/${WHATSAPP_NUMBER}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold underline"
                        >
                          Contactez-nous sur WhatsApp
                        </a>
                      </div>
                    )}

                    <Button
                      type="submit"
                      className="w-full gap-2"
                      size="lg"
                      disabled={status === "sending"}
                    >
                      {status === "sending" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Envoi en cours...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Envoyer le message
                        </>
                      )}
                    </Button>

                    <p className="text-xs text-center text-gray-500">
                      En envoyant ce formulaire, vous acceptez notre{" "}
                      <Link href="/privacy" className="text-blue-600 hover:underline">
                        politique de confidentialité
                      </Link>.
                    </p>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer minimal */}
      <footer className="border-t border-gray-200 py-8 px-4 bg-white mt-8">
        <div className="container mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-1.5 text-gray-700 hover:text-gray-900">
              <ArrowLeft className="h-4 w-4" />
              Retour à l&apos;accueil
            </Link>
          </div>
          <p>© 2026 {APP_NAME}. Tous droits réservés.</p>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-gray-900">CGU</Link>
            <Link href="/privacy" className="hover:text-gray-900">Confidentialité</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
