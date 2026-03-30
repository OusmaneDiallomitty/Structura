import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { UserPermissions } from "@/types/permissions";
import { ShieldCheck, BarChart3, DollarSign, Wallet } from "lucide-react";

interface PermissionsEditorProps {
  permissions: UserPermissions;
  onChange: (permissions: UserPermissions) => void;
  readOnly?: boolean;
  moduleType?: string;
}

export function PermissionsEditor({
  permissions,
  onChange,
  readOnly = false,
  moduleType,
}: PermissionsEditorProps) {
  const isCommerce = moduleType === 'COMMERCE';
  const isCoDirector = permissions.isCoDirector === true;
  const accountingView = permissions.accounting?.view === true;
  const canCreatePayments = permissions.payments?.create === true;
  const canCreateExpenses = permissions.expenses?.create === true;

  const updatePermission = (
    category: keyof UserPermissions,
    action: string,
    value: boolean
  ) => {
    if (readOnly || isCoDirector) return;
    onChange({
      ...permissions,
      [category]:
        category === "reports"
          ? { ...permissions[category], [action]: value }
          : { ...permissions[category as keyof Omit<UserPermissions, "reports" | "isCoDirector" | "accounting">], [action]: value },
    });
  };

  const toggleCoDirector = (value: boolean) => {
    if (readOnly) return;
    // Quand on active co-directeur, on garde l'état accounting tel quel
    onChange({ ...permissions, isCoDirector: value });
  };

  const toggleAccounting = (value: boolean) => {
    if (readOnly) return;
    onChange({ ...permissions, accounting: { view: value } });
  };

  const toggleCreatePayments = (value: boolean) => {
    if (readOnly) return;
    onChange({
      ...permissions,
      payments: { ...permissions.payments, create: value, edit: value, delete: false, configure: false },
    });
  };

  const toggleCreateExpenses = (value: boolean) => {
    if (readOnly) return;
    onChange({
      ...permissions,
      expenses: { ...permissions.expenses, create: value, edit: value, delete: false },
    });
  };

  return (
    <div className="space-y-6">
      {/* ── Directeur (co-directeur) ──────────────────────────────────── */}
      <div className={`rounded-lg border-2 p-4 transition-colors ${isCoDirector ? "border-violet-400 bg-violet-50" : "border-dashed border-gray-300 bg-gray-50"}`}>
        <div className="flex items-start gap-3">
          <div className={`rounded-full p-2 shrink-0 mt-0.5 ${isCoDirector ? "bg-violet-100 text-violet-700" : "bg-gray-200 text-gray-500"}`}>
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${isCoDirector ? "text-violet-800" : "text-gray-700"}`}>
              {isCommerce ? "Rôle Gérant" : "Rôle Directeur"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isCommerce
                ? "Accès opérationnel complet — ventes, stocks, clients, équipe"
                : "Accès opérationnel complet — élèves, présences, notes, paiements scolarité, équipe"}
            </p>
            {isCoDirector && (
              <p className="mt-2 text-xs text-violet-700 bg-violet-100 rounded px-3 py-2">
                ⚠️ Ce membre a accès à <strong>toutes les fonctionnalités opérationnelles</strong>. La comptabilité reste contrôlée séparément ci-dessous.
              </p>
            )}
          </div>
          <div className="flex flex-col items-center gap-1 shrink-0">
            <Switch
              checked={isCoDirector}
              onCheckedChange={toggleCoDirector}
              disabled={readOnly}
              className="mt-0.5 data-[state=unchecked]:bg-gray-300 data-[state=unchecked]:border-gray-400"
            />
            <span className={`text-[10px] font-medium ${isCoDirector ? "text-violet-700" : "text-gray-400"}`}>
              {isCoDirector ? "Actif" : "Inactif"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Accès comptabilité (visible uniquement pour les directeurs) ── */}
      {isCoDirector && (
        <div className={`rounded-lg border-2 p-4 transition-colors ${accountingView ? "border-amber-400 bg-amber-50" : "border-dashed border-gray-300 bg-gray-50"}`}>
          <div className="flex items-start gap-3">
            <div className={`rounded-full p-2 shrink-0 mt-0.5 ${accountingView ? "bg-amber-100 text-amber-700" : "bg-gray-200 text-gray-500"}`}>
              <BarChart3 className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${accountingView ? "text-amber-800" : "text-gray-700"}`}>
                Accès comptabilité
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Paie du personnel et statistiques financières globales — réservé au fondateur par défaut
              </p>
              {accountingView && (
                <p className="mt-2 text-xs text-amber-700 bg-amber-100 rounded px-3 py-2">
                  Ce directeur peut voir la paie du personnel et les statistiques financières.
                </p>
              )}
            </div>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <Switch
                checked={accountingView}
                onCheckedChange={toggleAccounting}
                disabled={readOnly}
                className="mt-0.5 data-[state=unchecked]:bg-gray-300 data-[state=unchecked]:border-gray-400"
              />
              <span className={`text-[10px] font-medium ${accountingView ? "text-amber-700" : "text-gray-400"}`}>
                {accountingView ? "Autorisé" : "Bloqué"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Enregistrer des paiements (visible uniquement pour les directeurs) ── */}
      {isCoDirector && (
        <div className={`rounded-lg border-2 p-4 transition-colors ${canCreatePayments ? "border-emerald-400 bg-emerald-50" : "border-dashed border-gray-300 bg-gray-50"}`}>
          <div className="flex items-start gap-3">
            <div className={`rounded-full p-2 shrink-0 mt-0.5 ${canCreatePayments ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"}`}>
              <DollarSign className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${canCreatePayments ? "text-emerald-800" : "text-gray-700"}`}>
                Enregistrer des paiements
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isCommerce
                  ? "Autoriser le gérant à enregistrer des ventes — par défaut réservé au caissier/comptable"
                  : "Autoriser le directeur à encaisser les frais de scolarité — par défaut réservé au secrétaire/comptable"}
              </p>
            </div>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <Switch
                checked={canCreatePayments}
                onCheckedChange={toggleCreatePayments}
                disabled={readOnly}
                className="mt-0.5 data-[state=unchecked]:bg-gray-300 data-[state=unchecked]:border-gray-400"
              />
              <span className={`text-[10px] font-medium ${canCreatePayments ? "text-emerald-700" : "text-gray-400"}`}>
                {canCreatePayments ? "Autorisé" : "Bloqué"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Enregistrer des dépenses (visible uniquement pour les directeurs) ── */}
      {isCoDirector && (
        <div className={`rounded-lg border-2 p-4 transition-colors ${canCreateExpenses ? "border-blue-400 bg-blue-50" : "border-dashed border-gray-300 bg-gray-50"}`}>
          <div className="flex items-start gap-3">
            <div className={`rounded-full p-2 shrink-0 mt-0.5 ${canCreateExpenses ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-500"}`}>
              <Wallet className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${canCreateExpenses ? "text-blue-800" : "text-gray-700"}`}>
                Enregistrer des dépenses
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Autoriser le directeur à saisir des dépenses — par défaut réservé au comptable
              </p>
            </div>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <Switch
                checked={canCreateExpenses}
                onCheckedChange={toggleCreateExpenses}
                disabled={readOnly}
                className="mt-0.5 data-[state=unchecked]:bg-gray-300 data-[state=unchecked]:border-gray-400"
              />
              <span className={`text-[10px] font-medium ${canCreateExpenses ? "text-blue-700" : "text-gray-400"}`}>
                {canCreateExpenses ? "Autorisé" : "Bloqué"}
              </span>
            </div>
          </div>
        </div>
      )}

      <Separator />

      {/* ── Permissions granulaires (désactivées si co-directeur) ────── */}
      <div className={isCoDirector ? "opacity-40 pointer-events-none select-none" : ""}>
        <p className="text-xs text-muted-foreground mb-4">
          {isCoDirector
            ? "Permissions ignorées — rôle Directeur actif"
            : "Configurez les permissions individuelles de ce membre"}
        </p>

        {/* Gestion Financière */}
        <div className="space-y-3">
          <h4 className="font-semibold flex items-center gap-2">
            💰 Gestion Financière
          </h4>
          <div className="space-y-2 pl-6">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="payments-view"
                checked={permissions.payments.view}
                onCheckedChange={(checked) =>
                  updatePermission("payments", "view", checked as boolean)
                }
                disabled={readOnly || isCoDirector}
              />
              <Label htmlFor="payments-view" className="cursor-pointer">
                Voir les paiements
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="payments-create"
                checked={permissions.payments.create}
                onCheckedChange={(checked) =>
                  updatePermission("payments", "create", checked as boolean)
                }
                disabled={readOnly || isCoDirector}
              />
              <Label htmlFor="payments-create" className="cursor-pointer">
                Enregistrer les paiements
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="payments-edit"
                checked={permissions.payments.edit}
                onCheckedChange={(checked) =>
                  updatePermission("payments", "edit", checked as boolean)
                }
                disabled={readOnly || isCoDirector}
              />
              <Label htmlFor="payments-edit" className="cursor-pointer">
                Modifier les paiements
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="payments-delete"
                checked={permissions.payments.delete}
                onCheckedChange={(checked) =>
                  updatePermission("payments", "delete", checked as boolean)
                }
                disabled={readOnly || isCoDirector}
              />
              <Label htmlFor="payments-delete" className="cursor-pointer">
                Supprimer les paiements
                <span className="text-xs text-muted-foreground ml-2">
                  (Fondateur uniquement)
                </span>
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="payments-configure"
                checked={permissions.payments.configure ?? false}
                onCheckedChange={(checked) =>
                  updatePermission("payments", "configure", checked as boolean)
                }
                disabled={readOnly || isCoDirector}
              />
              <Label htmlFor="payments-configure" className="cursor-pointer">
                {isCommerce ? "Configurer les tarifs et prix" : "Configurer les frais de scolarité"}
                <span className="text-xs text-muted-foreground ml-2">
                  {isCommerce ? "(montants, promotions)" : "(montants, fréquence, calendrier)"}
                </span>
              </Label>
            </div>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Gestion des Élèves / Clients */}
        <div className="space-y-3">
          <h4 className="font-semibold flex items-center gap-2">
            {isCommerce ? "🛒 Gestion des Clients" : "👥 Gestion des Élèves"}
          </h4>
          <div className="space-y-2 pl-6">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="students-view"
                checked={permissions.students.view}
                onCheckedChange={(checked) =>
                  updatePermission("students", "view", checked as boolean)
                }
                disabled={readOnly || isCoDirector}
              />
              <Label htmlFor="students-view" className="cursor-pointer">
                {isCommerce ? "Voir les clients" : "Voir les élèves"}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="students-create"
                checked={permissions.students.create}
                onCheckedChange={(checked) =>
                  updatePermission("students", "create", checked as boolean)
                }
                disabled={readOnly || isCoDirector}
              />
              <Label htmlFor="students-create" className="cursor-pointer">
                {isCommerce ? "Ajouter des clients" : "Ajouter des élèves"}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="students-edit"
                checked={permissions.students.edit}
                onCheckedChange={(checked) =>
                  updatePermission("students", "edit", checked as boolean)
                }
                disabled={readOnly || isCoDirector}
              />
              <Label htmlFor="students-edit" className="cursor-pointer">
                {isCommerce ? "Modifier les clients" : "Modifier les élèves"}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="students-delete"
                checked={permissions.students.delete}
                onCheckedChange={(checked) =>
                  updatePermission("students", "delete", checked as boolean)
                }
                disabled={readOnly || isCoDirector}
              />
              <Label htmlFor="students-delete" className="cursor-pointer">
                {isCommerce ? "Supprimer des clients" : "Supprimer des élèves"}
              </Label>
            </div>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Gestion Académique / Commerciale */}
        <div className="space-y-3">
          <h4 className="font-semibold flex items-center gap-2">
            {isCommerce ? "📦 Gestion Commerciale" : "📚 Gestion Académique"}
          </h4>
          <div className="space-y-2 pl-6">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="attendance-view"
                checked={permissions.attendance.view}
                onCheckedChange={(checked) =>
                  updatePermission("attendance", "view", checked as boolean)
                }
                disabled={readOnly || isCoDirector}
              />
              <Label htmlFor="attendance-view" className="cursor-pointer">
                {isCommerce ? "Voir les stocks" : "Voir les présences"}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="attendance-create"
                checked={permissions.attendance.create}
                onCheckedChange={(checked) =>
                  updatePermission("attendance", "create", checked as boolean)
                }
                disabled={readOnly || isCoDirector}
              />
              <Label htmlFor="attendance-create" className="cursor-pointer">
                {isCommerce ? "Gérer les stocks" : "Gérer les présences"}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="grades-view"
                checked={permissions.grades.view}
                onCheckedChange={(checked) =>
                  updatePermission("grades", "view", checked as boolean)
                }
                disabled={readOnly || isCoDirector}
              />
              <Label htmlFor="grades-view" className="cursor-pointer">
                {isCommerce ? "Voir les ventes" : "Voir les notes"}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="grades-create"
                checked={permissions.grades.create}
                onCheckedChange={(checked) =>
                  updatePermission("grades", "create", checked as boolean)
                }
                disabled={readOnly || isCoDirector}
              />
              <Label htmlFor="grades-create" className="cursor-pointer">
                {isCommerce ? "Annuler des ventes" : "Gérer les notes"}
              </Label>
            </div>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Rapports */}
        <div className="space-y-3">
          <h4 className="font-semibold flex items-center gap-2">
            📊 Rapports
          </h4>
          <div className="space-y-2 pl-6">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="reports-view"
                checked={permissions.reports.view}
                onCheckedChange={(checked) =>
                  updatePermission("reports", "view", checked as boolean)
                }
                disabled={readOnly || isCoDirector}
              />
              <Label htmlFor="reports-view" className="cursor-pointer">
                Voir les rapports financiers
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="reports-export"
                checked={permissions.reports.export}
                onCheckedChange={(checked) =>
                  updatePermission("reports", "export", checked as boolean)
                }
                disabled={readOnly || isCoDirector}
              />
              <Label htmlFor="reports-export" className="cursor-pointer">
                Exporter les rapports
              </Label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
