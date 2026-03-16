"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import * as storage from "@/lib/storage";
import { createStudent } from "@/lib/api/students.service";
import { getClasses } from "@/lib/api/classes.service";
import { formatClassName } from "@/lib/class-helpers";
import { useOnline } from "@/hooks/use-online";
import { offlineDB, STORES } from "@/lib/offline-db";
import { syncQueue } from "@/lib/sync-queue";

interface ClassOption {
  id: string;
  name: string;
  section?: string | null;
}

function AddStudentPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedClassId = searchParams.get("classId") ?? "";
  const isOnline = useOnline();

  const [isLoading, setIsLoading] = useState(false);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",
    class: preselectedClassId, // Pré-rempli si on vient de la page détail classe
    parentFirstName: "",
    parentLastName: "",
    parentPhone: "",
    parentEmail: "",
    parentProfession: "",
    address: "",
  });

  // Charger les classes au montage et à la reconnexion
  useEffect(() => {
    loadClasses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  async function loadClasses() {
    const token = storage.getAuthItem('structura_token');

    // Mode hors ligne → lire depuis IndexedDB
    if (!isOnline) {
      try {
        const cached = await offlineDB.getAll<{ id: string; name: string; section?: string | null }>(STORES.CLASSES);
        setClasses(cached.map((c) => ({ id: c.id, name: c.name, section: c.section })));
      } catch { /* ignore */ }
      return;
    }

    try {
      if (!token) return;

      const response = await getClasses(token);
      const classesData = Array.isArray(response) ? response : [];

      setClasses(classesData.map((c: any) => ({
        id: c.id,
        name: c.name,
        section: c.section,
      })));
    } catch {
      // Fallback IndexedDB si API indisponible
      try {
        const cached = await offlineDB.getAll<{ id: string; name: string; section?: string | null }>(STORES.CLASSES);
        setClasses(cached.map((c) => ({ id: c.id, name: c.name, section: c.section })));
      } catch { /* ignore */ }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const token = storage.getAuthItem('structura_token');

      if (!token && isOnline) {
        toast.error('Votre session a expiré — veuillez vous reconnecter.');
        router.push('/login');
        return;
      }

      const studentDto = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        classId: formData.class,
        dateOfBirth: formData.dateOfBirth,
        gender: formData.gender,
        parentName: `${formData.parentFirstName} ${formData.parentLastName}`,
        parentPhone: formData.parentPhone,
        parentEmail: formData.parentEmail || undefined,
        parentProfession: formData.parentProfession || undefined,
        address: formData.address,
      };

      if (!isOnline) {
        // Mode hors ligne : sauvegarder localement avec un ID temporaire
        const tempId = `offline-student-${crypto.randomUUID()}`;
        const localStudent = {
          id: tempId,
          _tempId: tempId,
          ...studentDto,
          matricule: "",
          needsSync: true,
          createdAt: new Date().toISOString(),
        };

        await offlineDB.add(STORES.STUDENTS, localStudent);
        await syncQueue.add({ type: "student", action: "create", data: { _tempId: tempId, ...studentDto } });

        toast.info("Élève sauvegardé hors ligne", {
          description: "Il sera envoyé au serveur dès la reconnexion.",
          duration: 5000,
        });
        router.push("/dashboard/students");
        return;
      }

      // Appel API pour créer l'élève (le matricule est généré automatiquement par le backend)
      await createStudent(token!, studentDto);

      toast.success("Élève ajouté avec succès!", {
        description: `${formData.firstName} ${formData.lastName} a été ajouté à la classe ${formData.class}.`,
        duration: 4000,
      });

      router.push("/dashboard/students");
    } catch (error: any) {
      // Race condition : isOnline=true mais connexion coupée juste avant l'appel
      if (!navigator.onLine || error.message === 'Failed to fetch') {
        const tempId = `offline-student-${crypto.randomUUID()}`;
        const studentDto = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          classId: formData.class,
          dateOfBirth: formData.dateOfBirth,
          gender: formData.gender,
          parentName: `${formData.parentFirstName} ${formData.parentLastName}`,
          parentPhone: formData.parentPhone,
          parentEmail: formData.parentEmail || undefined,
          parentProfession: formData.parentProfession || undefined,
          address: formData.address,
        };
        const localStudent = {
          id: tempId,
          _tempId: tempId,
          ...studentDto,
          matricule: "",
          needsSync: true,
          createdAt: new Date().toISOString(),
        };
        await offlineDB.add(STORES.STUDENTS, localStudent);
        await syncQueue.add({ type: "student", action: "create", data: { _tempId: tempId, ...studentDto } });
        toast.info("Élève sauvegardé hors ligne", {
          description: "Il sera envoyé au serveur dès la reconnexion.",
          duration: 5000,
        });
        router.push("/dashboard/students");
      } else {
        toast.error("Erreur lors de l'ajout", {
          description: error.message || "Une erreur est survenue. Veuillez réessayer.",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3 sm:gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="transition-all duration-200 hover:scale-110 flex-shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">Ajouter un Élève</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1 truncate">
            Remplissez les informations de l'élève
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Informations de l'élève */}
        <Card className="border-2 shadow-md">
          <CardHeader className="bg-linear-to-r from-blue-50 to-indigo-50 border-b">
            <CardTitle className="text-lg sm:text-xl">Informations de l'Élève</CardTitle>
            <CardDescription className="text-sm">
              Informations personnelles de l'élève
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 pt-4 sm:pt-6">
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">Prénom *</Label>
                <Input
                  id="firstName"
                  required
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData({ ...formData, firstName: e.target.value })
                  }
                  placeholder="Ex: Fatou"
                  className="border-2"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Nom *</Label>
                <Input
                  id="lastName"
                  required
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData({ ...formData, lastName: e.target.value })
                  }
                  placeholder="Ex: Camara"
                  className="border-2"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth" className="text-sm">Date de Naissance *</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  required
                  value={formData.dateOfBirth}
                  onChange={(e) =>
                    setFormData({ ...formData, dateOfBirth: e.target.value })
                  }
                  className="border-2"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">Genre *</Label>
                <Select
                  value={formData.gender}
                  onValueChange={(value) =>
                    setFormData({ ...formData, gender: value })
                  }
                  required
                >
                  <SelectTrigger className="border-2">
                    <SelectValue placeholder="Sélectionnez" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Masculin</SelectItem>
                    <SelectItem value="F">Féminin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {preselectedClassId ? (
              /* Vient de la page détail classe → classe fixe, pas de sélection */
              <div className="space-y-2">
                <Label>Classe</Label>
                <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                  <span className="text-sm font-medium">
                    {classes.find((c) => c.id === preselectedClassId)
                      ? formatClassName(
                          classes.find((c) => c.id === preselectedClassId)!.name,
                          classes.find((c) => c.id === preselectedClassId)!.section
                        )
                      : "Chargement..."}
                  </span>
                  <span className="ml-auto text-xs text-emerald-600 font-medium">✓ Définie</span>
                </div>
              </div>
            ) : (
              /* Vient de la page élèves → sélection normale */
              <div className="space-y-2">
                <Label htmlFor="class">Classe *</Label>
                <Select
                  value={formData.class}
                  onValueChange={(value) =>
                    setFormData({ ...formData, class: value })
                  }
                  required
                >
                  <SelectTrigger className="border-2">
                    <SelectValue placeholder="Sélectionnez une classe" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    {classes.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Aucune classe disponible.<br />
                        Utilisez le modal d'onboarding pour créer des classes.
                      </div>
                    ) : (
                      classes.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id}>
                          {formatClassName(cls.name, cls.section)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Informations du parent */}
        <Card className="border-2 shadow-md">
          <CardHeader className="bg-linear-to-r from-violet-50 to-purple-50 border-b">
            <CardTitle className="text-lg sm:text-xl">Informations du Parent/Tuteur</CardTitle>
            <CardDescription className="text-sm">
              Coordonnées du parent ou tuteur légal
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 pt-4 sm:pt-6">
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="parentFirstName">Prénom du Parent *</Label>
                <Input
                  id="parentFirstName"
                  required
                  value={formData.parentFirstName}
                  onChange={(e) =>
                    setFormData({ ...formData, parentFirstName: e.target.value })
                  }
                  placeholder="Ex: Aissatou"
                  className="border-2"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="parentLastName">Nom du Parent *</Label>
                <Input
                  id="parentLastName"
                  required
                  value={formData.parentLastName}
                  onChange={(e) =>
                    setFormData({ ...formData, parentLastName: e.target.value })
                  }
                  placeholder="Ex: Camara"
                  className="border-2"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="parentPhone" className="text-sm">Téléphone *</Label>
                <Input
                  id="parentPhone"
                  type="tel"
                  required
                  value={formData.parentPhone}
                  onChange={(e) =>
                    setFormData({ ...formData, parentPhone: e.target.value })
                  }
                  placeholder="+224 621 234 567"
                  className="border-2"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="parentEmail">Email (optionnel)</Label>
                <Input
                  id="parentEmail"
                  type="email"
                  value={formData.parentEmail}
                  onChange={(e) =>
                    setFormData({ ...formData, parentEmail: e.target.value })
                  }
                  placeholder="parent@exemple.com"
                  className="border-2"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="parentProfession">Profession (optionnel)</Label>
              <Input
                id="parentProfession"
                value={formData.parentProfession}
                onChange={(e) =>
                  setFormData({ ...formData, parentProfession: e.target.value })
                }
                placeholder="Ex: Enseignant, Commerçant, Médecin..."
                className="border-2"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Adresse *</Label>
              <Input
                id="address"
                required
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                placeholder="Ex: Quartier Madina, Conakry"
                className="border-2"
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isLoading}
            className="border-2 w-full sm:w-auto order-2 sm:order-1"
          >
            Annuler
          </Button>
          <Button
            type="submit"
            disabled={isLoading}
            className="gap-2 shadow-md w-full sm:w-auto order-1 sm:order-2"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Enregistrer
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function AddStudentPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <AddStudentPageContent />
    </Suspense>
  );
}
