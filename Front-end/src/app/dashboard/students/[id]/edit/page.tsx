"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, Save, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import * as storage from "@/lib/storage";
import { getStudentById, updateStudent } from "@/lib/api/students.service";
import { getClasses } from "@/lib/api/classes.service";
import { formatClassName } from "@/lib/class-helpers";
import { offlineDB, STORES } from "@/lib/offline-db";
import { syncQueue } from "@/lib/sync-queue";
import { useOnline } from "@/hooks/use-online";

// Schéma de validation
const editStudentSchema = z.object({
  firstName: z.string().min(2, "Le prénom doit contenir au moins 2 caractères"),
  lastName: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
  classId: z.string().min(1, "Veuillez sélectionner une classe"),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  parentName: z.string().optional(),
  parentPhone: z.string().optional(),
  parentEmail: z.string().email("Email invalide").optional().or(z.literal("")),
  parentProfession: z.string().optional(),
  address: z.string().optional(),
});

type EditStudentFormData = z.infer<typeof editStudentSchema>;

export default function EditStudentPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.id as string;
  const isOnline = useOnline();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<EditStudentFormData>({
    resolver: zodResolver(editStudentSchema),
  });

  const classId = watch("classId");
  const gender = watch("gender");

  useEffect(() => {
    loadStudent();
    loadClasses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  async function loadClasses() {
    try {
      // Mode offline → lire depuis IndexedDB
      if (!isOnline) {
        const cached = await offlineDB.getAll<{ id: string; name: string; section?: string | null }>(STORES.CLASSES);
        setClasses(cached.map((c) => ({ id: c.id, name: c.name, section: c.section })));
        return;
      }

      const token = storage.getAuthItem('structura_token');
      if (!token) return;

      const response = await getClasses(token);
      const classesData = Array.isArray(response) ? response : [];
      setClasses(classesData);
      // Sauvegarder en cache pour la prochaine fois hors ligne
      await offlineDB.bulkAdd(STORES.CLASSES, classesData).catch(() => {});
    } catch {
      // Fallback IndexedDB si API indisponible
      const cached = await offlineDB.getAll<{ id: string; name: string; section?: string | null }>(STORES.CLASSES).catch(() => []);
      setClasses(cached.map((c) => ({ id: c.id, name: c.name, section: c.section })));
    }
  }

  async function loadStudent() {
    setIsLoading(true);

    try {
      // Mode offline → lire depuis IndexedDB
      if (!isOnline) {
        const cached = await offlineDB.getById<any>(STORES.STUDENTS, studentId);
        if (cached) {
          setValue("firstName",        cached.firstName        || "");
          setValue("lastName",         cached.lastName         || "");
          setValue("classId",          cached.classId          || "");
          const rawDate = cached.dateOfBirth ?? '';
          setValue("dateOfBirth",      rawDate ? rawDate.split('T')[0] : '');
          setValue("gender",           cached.gender           || "");
          setValue("parentName",       cached.parentName       || "");
          setValue("parentPhone",      cached.parentPhone      || "");
          setValue("parentEmail",      cached.parentEmail      || "");
          setValue("parentProfession", cached.parentProfession || "");
          setValue("address",          cached.address          || "");
        } else {
          toast.error("Élève non disponible hors ligne");
          router.push('/dashboard/students');
        }
        return;
      }

      const token = storage.getAuthItem('structura_token');
      if (!token) {
        toast.error('Session expirée');
        router.push('/login');
        return;
      }

      const student = await getStudentById(token, studentId);

      setValue("firstName",        student.firstName        || "");
      setValue("lastName",         student.lastName         || "");
      setValue("classId",          student.classId          || "");
      const rawDate = student.dateOfBirth ?? '';
      setValue("dateOfBirth",      rawDate ? rawDate.split('T')[0] : '');
      setValue("gender",           student.gender           || "");
      setValue("parentName",       student.parentName       || "");
      setValue("parentPhone",      student.parentPhone      || "");
      setValue("parentEmail",      student.parentEmail      || "");
      setValue("parentProfession", student.parentProfession || "");
      setValue("address",          student.address          || "");

      // Mettre à jour le cache IndexedDB pour la prochaine fois hors ligne
      await offlineDB.update(STORES.STUDENTS, student).catch(() => {});
    } catch (error: any) {
      // Réseau coupé pendant le chargement → fallback IndexedDB
      const cached = await offlineDB.getById<any>(STORES.STUDENTS, studentId).catch(() => null);
      if (cached) {
        setValue("firstName",        cached.firstName        || "");
        setValue("lastName",         cached.lastName         || "");
        setValue("classId",          cached.classId          || "");
        const rawDate = cached.dateOfBirth ?? '';
        setValue("dateOfBirth",      rawDate ? rawDate.split('T')[0] : '');
        setValue("gender",           cached.gender           || "");
        setValue("parentName",       cached.parentName       || "");
        setValue("parentPhone",      cached.parentPhone      || "");
        setValue("parentEmail",      cached.parentEmail      || "");
        setValue("parentProfession", cached.parentProfession || "");
        setValue("address",          cached.address          || "");
        toast.info("Mode hors ligne — données chargées depuis le cache");
      } else {
        toast.error('Impossible de charger les informations de l\'élève');
        router.push('/dashboard/students');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function onSubmit(data: EditStudentFormData) {
    setIsSaving(true);

    try {
      if (!isOnline) {
        // ── Mode hors ligne : sauvegarder localement et mettre en queue ─────
        const existing = await offlineDB.getById<any>(STORES.STUDENTS, studentId).catch(() => null);
        const updated = {
          ...(existing ?? {}),
          id: studentId,
          ...data,
          needsSync: true,
          updatedAt: new Date().toISOString(),
        };
        await offlineDB.update(STORES.STUDENTS, updated);
        await syncQueue.add({ type: "student", action: "update", data: { id: studentId, ...data } });
        toast.info("Modification sauvegardée hors ligne", {
          description: "Elle sera envoyée au serveur dès la reconnexion.",
        });
        router.push(`/dashboard/students/${studentId}`);
        return;
      }

      const token = storage.getAuthItem('structura_token');
      if (!token) {
        toast.error('Session expirée');
        router.push('/login');
        return;
      }

      await updateStudent(token, studentId, data);

      // Mettre à jour IndexedDB immédiatement (cohérence offline)
      const existing = await offlineDB.getById<any>(STORES.STUDENTS, studentId).catch(() => null);
      if (existing) {
        await offlineDB.update(STORES.STUDENTS, { ...existing, ...data, needsSync: false }).catch(() => {});
      }

      toast.success('Élève modifié avec succès !');
      router.push(`/dashboard/students/${studentId}`);
    } catch (error: any) {
      // Race condition : isOnline=true mais connexion coupée juste avant l'appel
      if (!navigator.onLine || error.message === 'Failed to fetch') {
        const existing = await offlineDB.getById<any>(STORES.STUDENTS, studentId).catch(() => null);
        const updated = {
          ...(existing ?? {}),
          id: studentId,
          ...data,
          needsSync: true,
          updatedAt: new Date().toISOString(),
        };
        await offlineDB.update(STORES.STUDENTS, updated).catch(() => {});
        await syncQueue.add({ type: "student", action: "update", data: { id: studentId, ...data } });
        toast.info("Modification sauvegardée hors ligne", {
          description: "Elle sera envoyée au serveur dès la reconnexion.",
        });
        router.push(`/dashboard/students/${studentId}`);
      } else {
        toast.error(error.message || 'Erreur lors de la modification');
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3 sm:gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/dashboard/students/${studentId}`)}
          className="flex-shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">Modifier l'élève</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1 truncate">
            Mettez à jour les informations de l'élève
          </p>
        </div>
        {!isOnline && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full shrink-0">
            <WifiOff className="h-3.5 w-3.5" />
            Hors ligne
          </div>
        )}
      </div>

      {/* Formulaire */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Informations personnelles */}
        <Card>
          <CardHeader>
            <CardTitle>Informations personnelles</CardTitle>
            <CardDescription>Identité et date de naissance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Prénom *</Label>
                <Input
                  id="firstName"
                  placeholder="Fatou"
                  disabled={isSaving}
                  {...register("firstName")}
                />
                {errors.firstName && (
                  <p className="text-sm text-red-600">{errors.firstName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">Nom *</Label>
                <Input
                  id="lastName"
                  placeholder="Camara"
                  disabled={isSaving}
                  {...register("lastName")}
                />
                {errors.lastName && (
                  <p className="text-sm text-red-600">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Date de naissance</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  disabled={isSaving}
                  {...register("dateOfBirth")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender">Genre</Label>
                <Select
                  value={gender}
                  onValueChange={(value) => setValue("gender", value)}
                  disabled={isSaving}
                >
                  <SelectTrigger id="gender">
                    <SelectValue placeholder="Sélectionnez un genre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Masculin</SelectItem>
                    <SelectItem value="F">Féminin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scolarité */}
        <Card>
          <CardHeader>
            <CardTitle>Scolarité</CardTitle>
            <CardDescription>Classe et informations académiques</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="classId">Classe *</Label>
              <Select
                value={classId}
                onValueChange={(value) => setValue("classId", value)}
                disabled={isSaving}
              >
                <SelectTrigger id="classId">
                  <SelectValue placeholder="Sélectionnez une classe" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {formatClassName(cls.name, cls.section)}
                    </SelectItem>
                  ))}
                  {classes.length === 0 && (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      Aucune classe disponible
                    </div>
                  )}
                </SelectContent>
              </Select>
              {errors.classId && (
                <p className="text-sm text-red-600">{errors.classId.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Informations du parent */}
        <Card>
          <CardHeader>
            <CardTitle>Informations du parent/tuteur</CardTitle>
            <CardDescription>Contact d'urgence</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="parentName">Nom du parent/tuteur</Label>
              <Input
                id="parentName"
                placeholder="Mme Aissatou Camara"
                disabled={isSaving}
                {...register("parentName")}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="parentPhone">Téléphone</Label>
                <Input
                  id="parentPhone"
                  type="tel"
                  placeholder="+224 621 234 567"
                  disabled={isSaving}
                  {...register("parentPhone")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="parentEmail">Email</Label>
                <Input
                  id="parentEmail"
                  type="email"
                  placeholder="parent@exemple.com"
                  disabled={isSaving}
                  {...register("parentEmail")}
                />
                {errors.parentEmail && (
                  <p className="text-sm text-red-600">{errors.parentEmail.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="parentProfession">Profession</Label>
              <Input
                id="parentProfession"
                placeholder="Ex: Enseignant, Commerçant, Médecin..."
                disabled={isSaving}
                {...register("parentProfession")}
              />
            </div>
          </CardContent>
        </Card>

        {/* Adresse */}
        <Card>
          <CardHeader>
            <CardTitle>Adresse</CardTitle>
            <CardDescription>Lieu de résidence</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="address">Adresse complète</Label>
              <Input
                id="address"
                placeholder="Quartier Madina, Commune de Ratoma"
                disabled={isSaving}
                {...register("address")}
              />
            </div>
          </CardContent>
        </Card>

        {/* Boutons */}
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/dashboard/students/${studentId}`)}
            disabled={isSaving}
            className="flex-1"
          >
            Annuler
          </Button>
          <Button
            type="submit"
            disabled={isSaving}
            className="flex-1"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {isOnline ? "Enregistrer les modifications" : "Sauvegarder hors ligne"}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
