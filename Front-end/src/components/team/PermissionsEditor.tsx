import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { UserPermissions } from "@/types/permissions";

interface PermissionsEditorProps {
  permissions: UserPermissions;
  onChange: (permissions: UserPermissions) => void;
  readOnly?: boolean;
}

export function PermissionsEditor({
  permissions,
  onChange,
  readOnly = false,
}: PermissionsEditorProps) {
  const updatePermission = (
    category: keyof UserPermissions,
    action: string,
    value: boolean
  ) => {
    if (readOnly) return;
    onChange({
      ...permissions,
      [category]:
        category === "reports"
          ? { ...permissions[category], [action]: value }
          : { ...permissions[category as keyof Omit<UserPermissions, "reports">], [action]: value },
    });
  };

  return (
    <div className="space-y-6">
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
              disabled={readOnly}
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
              disabled={readOnly}
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
              disabled={readOnly}
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
              disabled={readOnly}
            />
            <Label htmlFor="payments-delete" className="cursor-pointer">
              Supprimer les paiements
              <span className="text-xs text-muted-foreground ml-2">
                (Directeur uniquement)
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
              disabled={readOnly}
            />
            <Label htmlFor="payments-configure" className="cursor-pointer">
              Configurer les frais de scolarité
              <span className="text-xs text-muted-foreground ml-2">
                (montants, fréquence, calendrier)
              </span>
            </Label>
          </div>
        </div>
      </div>

      <Separator />

      {/* Gestion des Élèves */}
      <div className="space-y-3">
        <h4 className="font-semibold flex items-center gap-2">
          👥 Gestion des Élèves
        </h4>
        <div className="space-y-2 pl-6">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="students-view"
              checked={permissions.students.view}
              onCheckedChange={(checked) =>
                updatePermission("students", "view", checked as boolean)
              }
              disabled={readOnly}
            />
            <Label htmlFor="students-view" className="cursor-pointer">
              Voir les élèves
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="students-create"
              checked={permissions.students.create}
              onCheckedChange={(checked) =>
                updatePermission("students", "create", checked as boolean)
              }
              disabled={readOnly}
            />
            <Label htmlFor="students-create" className="cursor-pointer">
              Ajouter des élèves
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="students-edit"
              checked={permissions.students.edit}
              onCheckedChange={(checked) =>
                updatePermission("students", "edit", checked as boolean)
              }
              disabled={readOnly}
            />
            <Label htmlFor="students-edit" className="cursor-pointer">
              Modifier les élèves
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="students-delete"
              checked={permissions.students.delete}
              onCheckedChange={(checked) =>
                updatePermission("students", "delete", checked as boolean)
              }
              disabled={readOnly}
            />
            <Label htmlFor="students-delete" className="cursor-pointer">
              Supprimer des élèves
            </Label>
          </div>
        </div>
      </div>

      <Separator />

      {/* Gestion Académique */}
      <div className="space-y-3">
        <h4 className="font-semibold flex items-center gap-2">
          📚 Gestion Académique
        </h4>
        <div className="space-y-2 pl-6">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="attendance-view"
              checked={permissions.attendance.view}
              onCheckedChange={(checked) =>
                updatePermission("attendance", "view", checked as boolean)
              }
              disabled={readOnly}
            />
            <Label htmlFor="attendance-view" className="cursor-pointer">
              Voir les présences
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="attendance-create"
              checked={permissions.attendance.create}
              onCheckedChange={(checked) =>
                updatePermission("attendance", "create", checked as boolean)
              }
              disabled={readOnly}
            />
            <Label htmlFor="attendance-create" className="cursor-pointer">
              Gérer les présences
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="grades-view"
              checked={permissions.grades.view}
              onCheckedChange={(checked) =>
                updatePermission("grades", "view", checked as boolean)
              }
              disabled={readOnly}
            />
            <Label htmlFor="grades-view" className="cursor-pointer">
              Voir les notes
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="grades-create"
              checked={permissions.grades.create}
              onCheckedChange={(checked) =>
                updatePermission("grades", "create", checked as boolean)
              }
              disabled={readOnly}
            />
            <Label htmlFor="grades-create" className="cursor-pointer">
              Gérer les notes
            </Label>
          </div>
        </div>
      </div>

      <Separator />

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
              disabled={readOnly}
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
              disabled={readOnly}
            />
            <Label htmlFor="reports-export" className="cursor-pointer">
              Exporter les rapports
            </Label>
          </div>
        </div>
      </div>
    </div>
  );
}
