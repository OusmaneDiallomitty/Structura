"use client";

import { useState } from "react";
import { CommerceSalesReceiptData, generateCommerceSalesReceipt } from "@/lib/pdf-generator";
import { sendSalesReceiptEmail } from "@/lib/api/commerce.service";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, Printer, Mail, MessageCircle, Download } from "lucide-react";
import { toast } from "sonner";

interface SalesReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptData: CommerceSalesReceiptData;
  token: string;
  saleId?: string; // ID de la vente pour envoyer l'email
}

export function SalesReceiptDialog({
  open,
  onOpenChange,
  receiptData,
  token,
  saleId,
}: SalesReceiptDialogProps) {
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);

  const handleView = async () => {
    try {
      await generateCommerceSalesReceipt(receiptData, "preview");
    } catch (error) {
      toast.error("Erreur lors de la génération du reçu");
    }
  };

  const handlePrint = async () => {
    try {
      await generateCommerceSalesReceipt(receiptData, "print");
    } catch (error) {
      toast.error("Erreur lors de la génération du reçu");
    }
  };

  const handleDownload = async () => {
    try {
      await generateCommerceSalesReceipt(receiptData, "download");
      toast.success("Reçu téléchargé");
    } catch (error) {
      toast.error("Erreur lors du téléchargement");
    }
  };

  const handleSendEmail = async () => {
    if (!customerEmail.trim()) {
      toast.error("Veuillez entrer une adresse email");
      return;
    }

    if (!saleId) {
      toast.error("ID de vente manquant");
      return;
    }

    setIsLoadingEmail(true);
    try {
      await sendSalesReceiptEmail(token, saleId, customerEmail);
      toast.success(`Reçu envoyé à ${customerEmail}`);
      setShowEmailForm(false);
      setCustomerEmail("");
    } catch (error) {
      toast.error("Erreur lors de l'envoi de l'email");
    } finally {
      setIsLoadingEmail(false);
    }
  };

  const handleWhatsApp = () => {
    const message = `Reçu #${receiptData.receiptNumber} - Total: ${receiptData.totalAmount} GNF - Date: ${receiptData.date}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Reçu #{receiptData.receiptNumber}</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {receiptData.date} · {receiptData.time}
          </p>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Résumé reçu */}
          <div className="rounded-lg border p-4 bg-muted/40 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nombre d'articles</span>
              <span className="font-semibold">{receiptData.items.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold">{receiptData.totalAmount.toLocaleString("fr-GN")} GNF</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Montant payé</span>
              <span className="font-semibold text-green-600">{receiptData.paidAmount.toLocaleString("fr-GN")} GNF</span>
            </div>
            {receiptData.remainingAmount && receiptData.remainingAmount > 0 && (
              <div className="flex justify-between pt-2 border-t">
                <span className="text-muted-foreground">Reste dû</span>
                <span className="font-bold text-red-600">{receiptData.remainingAmount.toLocaleString("fr-GN")} GNF</span>
              </div>
            )}
          </div>

          {/* Actions principales */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleView}
            >
              <Eye className="h-4 w-4" />
              Afficher
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={handlePrint}
            >
              <Printer className="h-4 w-4" />
              Imprimer
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleDownload}
            >
              <Download className="h-4 w-4" />
              Télécharger
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleWhatsApp}
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </Button>
          </div>

          {/* Email form */}
          {!showEmailForm ? (
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => setShowEmailForm(true)}
            >
              <Mail className="h-4 w-4" />
              Envoyer par email
            </Button>
          ) : (
            <div className="space-y-3 p-3 rounded-lg border bg-muted/40">
              <div className="grid gap-2">
                <Label htmlFor="email" className="text-sm">Email du client</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="client@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  disabled={isLoadingEmail}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowEmailForm(false);
                    setCustomerEmail("");
                  }}
                  disabled={isLoadingEmail}
                >
                  Annuler
                </Button>
                <Button
                  size="sm"
                  className="bg-orange-600 hover:bg-orange-700 text-white flex-1"
                  onClick={handleSendEmail}
                  disabled={isLoadingEmail}
                >
                  {isLoadingEmail ? "Envoi..." : "Envoyer"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
