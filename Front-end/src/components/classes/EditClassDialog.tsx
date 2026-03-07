"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import * as storage from "@/lib/storage";
import { updateClass } from "@/lib/api/classes.service";

interface EditClassDialogProps {
  classItem: {
    id: string;
    name: string;
    level: string;
    section?: string | null;
    capacity: number;
    studentCount?: number;
    teacherName?: string;
  };
  onSuccess?: () => void;
}

export function EditClassDialog({ classItem, onSuccess }: EditClassDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fullName = classItem.section
    ? `${classItem.name} ${classItem.section}`
    : classItem.name;

  const [capacity, setCapacity] = useState(classItem.capacity);
  const [teacherName, setTeacherName] = useState(classItem.teacherName || "");

  const handleOpen = () => {
    setCapacity(classItem.capacity);
    setTeacherName(classItem.teacherName || "");
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const token = storage.getAuthItem("structura_token");
      if (!token) {
        toast.error("Session expirée");
        return;
      }

      await updateClass(token, classItem.id, {
        capacity,
        teacherName: teacherName || undefined,
      });

      toast.success("Classe modifiée avec succès !");
      setOpen(false);

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error("❌ Erreur:", error);
      toast.error(error.message || "Erreur lors de la modification");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleOpen}
        className="gap-2"
      >
        <Pencil className="h-4 w-4" />
        Modifier
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-full max-w-md mx-auto px-4 sm:px-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg leading-snug">
              Modifier la classe
            </DialogTitle>
            <DialogDescription className="text-sm break-words">
              Seules la capacité et l'enseignant sont modifiables.
              {classItem.studentCount && classItem.studentCount > 0 ? (
                <span className="block mt-2 text-amber-600 font-medium">
                  ⚠️ Cette classe contient {classItem.studentCount} élève(s).
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nom + Niveau en lecture seule */}
            <div className="rounded-lg border bg-muted/50 p-3 space-y-1 overflow-hidden">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Non modifiable
              </p>
              <p className="text-base sm:text-lg font-bold break-words leading-tight">
                {fullName}
              </p>
              <p className="text-sm text-muted-foreground break-words">
                {classItem.level}
              </p>
            </div>

            {/* Capacité */}
            <div className="space-y-1">
              <Label htmlFor="edit-capacity">Capacité *</Label>
              <Input
                id="edit-capacity"
                type="number"
                min="1"
                max="100"
                value={capacity}
                onChange={(e) => setCapacity(parseInt(e.target.value) || 1)}
                required
                className="w-full"
              />
            </div>

            {/* Enseignant */}
            <div className="space-y-1">
              <Label htmlFor="edit-teacher">Nom de l'enseignant</Label>
              <Input
                id="edit-teacher"
                placeholder="Ex: M. Diallo"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                className="w-full"
              />
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="w-full sm:w-auto"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                {isSubmitting ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
