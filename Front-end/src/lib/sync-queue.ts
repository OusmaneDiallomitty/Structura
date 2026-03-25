/**
 * Queue de synchronisation pour les actions hors ligne
 * Envoie automatiquement les données au serveur quand la connexion revient
 */

import { offlineDB, STORES } from "./offline-db";
import { toast } from "sonner";
import * as storage from "@/lib/storage";
import { createStudent, updateStudent, deleteStudent } from "@/lib/api/students.service";
import { createClass, updateClass, deleteClass } from "@/lib/api/classes.service";
import { createPayment, updatePayment, deletePayment } from "@/lib/api/payments.service";
import { createAttendance, updateAttendance } from "@/lib/api/attendance.service";
import { bulkSaveEvaluations, bulkSaveCompositions } from "@/lib/api/grades.service";

/** Erreur d'authentification non-retryable : token absent ou 401 */
class SyncAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncAuthError";
  }
}

export interface SyncAction {
  id?: number;
  type: "student" | "payment" | "attendance" | "grade" | "class" | "evaluation" | "composition";
  action: "create" | "update" | "delete" | "bulk_create";
  data: any;
  timestamp: number;
  retries: number;
}

class SyncQueue {
  private isProcessing = false;
  private maxRetries = 3;

  /**
   * Ajouter une action à la queue
   */
  async add(action: Omit<SyncAction, "id" | "timestamp" | "retries">): Promise<void> {
    const syncAction: SyncAction = {
      ...action,
      timestamp: Date.now(),
      retries: 0,
    };

    await offlineDB.add(STORES.SYNC_QUEUE, syncAction);
    console.log("📝 Action ajoutée à la queue de sync:", syncAction);

    // Tenter de synchroniser immédiatement si en ligne
    if (navigator.onLine && !this.isProcessing) {
      this.process();
    }
  }

  /**
   * Traiter la queue de synchronisation
   */
  async process(): Promise<void> {
    if (this.isProcessing) {
      console.log("⏳ Synchronisation déjà en cours...");
      return;
    }
    // Ne pas bloquer sur navigator.onLine — sur EDGE il reste true même sans internet.
    // On laisse les appels API échouer naturellement et retenter à la prochaine connexion.

    this.isProcessing = true;
    console.log("🔄 Début de la synchronisation...");

    try {
      const queue = await offlineDB.getAll<SyncAction>(STORES.SYNC_QUEUE);

      if (queue.length === 0) {
        console.log("✅ Queue de synchronisation vide");
        this.isProcessing = false;
        return;
      }

      console.log(`📊 ${queue.length} action(s) à synchroniser`);
      let successCount = 0;
      let failCount = 0;

      for (const action of queue) {
        try {
          await this.executeAction(action);

          // Supprimer de la queue après succès
          if (action.id) {
            await offlineDB.delete(STORES.SYNC_QUEUE, action.id);
          }

          // Mettre à jour le flag needsSync dans le store correspondant
          await this.updateSyncFlag(action);

          successCount++;
          console.log(`✅ Action synchronisée:`, action.type, action.action);
        } catch (error) {
          console.error(`❌ Erreur de synchronisation:`, error);

          // Erreur auth non-retryable → supprimer immédiatement
          if (error instanceof SyncAuthError) {
            if (action.id) {
              await offlineDB.delete(STORES.SYNC_QUEUE, action.id);
            }
            failCount++;
            console.error(`🔑 Action supprimée (auth error): ${error.message}`);
            continue;
          }

          // Incrémenter le compteur de tentatives
          action.retries++;

          if (action.retries >= this.maxRetries) {
            // Supprimer après trop de tentatives
            if (action.id) {
              await offlineDB.delete(STORES.SYNC_QUEUE, action.id);
            }
            failCount++;
            console.error(`❌ Action abandonnée après ${this.maxRetries} tentatives`);
          } else {
            // Mettre à jour le compteur de tentatives
            await offlineDB.update(STORES.SYNC_QUEUE, action);
          }
        }
      }

      // Afficher un toast de résultat
      if (successCount > 0) {
        toast.success(`Données mises à jour (${successCount} modification${successCount > 1 ? 's' : ''})`);
        // Notifier les pages pour qu'elles rechargent leurs données depuis le serveur
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sync:completed', { detail: { successCount } }));
        }
      }

      if (failCount > 0) {
        toast.warning(`${failCount} modification${failCount > 1 ? 's' : ''} non envoyée${failCount > 1 ? 's' : ''} — nouvel essai à la prochaine connexion.`);
      }

      console.log(`✅ Synchronisation terminée: ${successCount} succès, ${failCount} échecs`);
    } catch (error) {
      console.error("❌ Erreur lors de la synchronisation:", error);
      toast.error("Problème lors de la mise à jour des données.");
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Exécuter une action de synchronisation avec de vrais appels API
   */
  private async executeAction(action: SyncAction): Promise<void> {
    console.log("🔄 Exécution de l'action:", action.type, action.action);

    const token = storage.getAuthItem("structura_token");
    if (!token) {
      throw new SyncAuthError("Token absent — reconnexion requise");
    }

    try {
      switch (action.type) {
        case "student": {
          if (action.action === "create") {
            const { _tempId, needsSync, ...dto } = action.data;
            const created = await createStudent(token, dto);
            // Remplacer l'entrée temporaire par le vrai objet retourné par le serveur
            if (_tempId) {
              await offlineDB.delete(STORES.STUDENTS, _tempId);
            }
            await offlineDB.update(STORES.STUDENTS, { ...created, needsSync: false });
          } else if (action.action === "update") {
            const { id, _tempId, needsSync, ...dto } = action.data;
            await updateStudent(token, id, dto);
          } else if (action.action === "delete") {
            try {
              await deleteStudent(token, action.data.id);
            } catch (err: any) {
              // 404 = déjà supprimé → succès silencieux
              if (this.isNotFoundError(err)) return;
              throw err;
            }
          }
          break;
        }

        case "class": {
          if (action.action === "create") {
            const { _tempId, needsSync, ...dto } = action.data;
            const created = await createClass(token, dto);
            if (_tempId) {
              await offlineDB.delete(STORES.CLASSES, _tempId);
            }
            await offlineDB.update(STORES.CLASSES, { ...created, needsSync: false });
          } else if (action.action === "update") {
            const { id, _tempId, needsSync, ...dto } = action.data;
            await updateClass(token, id, dto);
          } else if (action.action === "delete") {
            try {
              await deleteClass(token, action.data.id);
            } catch (err: any) {
              if (this.isNotFoundError(err)) return;
              throw err;
            }
          }
          break;
        }

        case "payment": {
          if (action.action === "create") {
            const { _tempId, needsSync, ...dto } = action.data;
            const created = await createPayment(token, dto);
            if (_tempId) {
              await offlineDB.delete(STORES.PAYMENTS, _tempId);
            }
            await offlineDB.update(STORES.PAYMENTS, { ...created, needsSync: false });
          } else if (action.action === "update") {
            const { id, _tempId, needsSync, ...dto } = action.data;
            await updatePayment(token, id, dto);
          } else if (action.action === "delete") {
            try {
              await deletePayment(token, action.data.id);
            } catch (err: any) {
              if (this.isNotFoundError(err)) return;
              throw err;
            }
          }
          break;
        }

        case "attendance": {
          if (action.action === "create") {
            const { _tempId, needsSync, ...dto } = action.data;
            const created = await createAttendance(token, dto);
            if (_tempId) {
              await offlineDB.delete(STORES.ATTENDANCE, _tempId);
            }
            await offlineDB.update(STORES.ATTENDANCE, { ...created, needsSync: false });
          } else if (action.action === "update") {
            const { id, _tempId, needsSync, ...dto } = action.data;
            await updateAttendance(token, id, dto);
          }
          break;
        }

        case "evaluation": {
          if (action.action === "create") {
            await bulkSaveEvaluations(token, action.data);
          }
          break;
        }

        case "composition": {
          if (action.action === "create") {
            await bulkSaveCompositions(token, action.data);
          }
          break;
        }

        default:
          console.warn("Type d'action inconnu:", (action as any).type);
      }
    } catch (err: any) {
      // 401 Unauthorized → erreur non-retryable
      if (this.isAuthError(err)) {
        throw new SyncAuthError(`Unauthorized: ${err.message}`);
      }
      throw err;
    }
  }

  /** Détecte une erreur 404 / "not found" */
  private isNotFoundError(err: any): boolean {
    const msg = (err?.message ?? "").toLowerCase();
    return msg.includes("404") || msg.includes("not found") || msg.includes("introuvable");
  }

  /** Détecte une erreur 401 / Unauthorized */
  private isAuthError(err: any): boolean {
    const msg = (err?.message ?? "").toLowerCase();
    return msg.includes("401") || msg.includes("unauthorized") || msg.includes("non autorisé");
  }

  /**
   * Mettre à jour le flag needsSync après synchronisation réussie
   */
  private async updateSyncFlag(action: SyncAction): Promise<void> {
    // evaluation et composition utilisent des clés composites — pas de flag needsSync à mettre à jour
    if (action.type === "evaluation" || action.type === "composition") return;

    const storeMap: Record<string, string> = {
      student: STORES.STUDENTS,
      payment: STORES.PAYMENTS,
      attendance: STORES.ATTENDANCE,
      grade: STORES.GRADES,
      class: STORES.CLASSES,
    };

    const storeName = storeMap[action.type];
    if (!storeName || !action.data.id) return;

    try {
      const item = await offlineDB.getById(storeName, action.data.id);
      if (item) {
        await offlineDB.update(storeName, {
          ...item,
          needsSync: false,
        });
      }
    } catch (error) {
      console.error("Erreur lors de la mise à jour du flag needsSync:", error);
    }
  }

  /**
   * Obtenir le nombre d'actions en attente
   */
  async getPendingCount(): Promise<number> {
    const queue = await offlineDB.getAll<SyncAction>(STORES.SYNC_QUEUE);
    return queue.length;
  }

  /**
   * Vider la queue (à utiliser avec précaution)
   */
  async clear(): Promise<void> {
    await offlineDB.clear(STORES.SYNC_QUEUE);
    console.log("🗑️ Queue de synchronisation vidée");
  }
}

// Instance singleton
export const syncQueue = new SyncQueue();

// Écouter le retour de connexion pour synchroniser automatiquement.
// Deux sources : événement natif 'online' (WiFi/mode avion) + 'network:online'
// dispatché par fetchWithTimeout quand un appel API réussit réellement
// (corrige navigator.onLine unreliable sur EDGE et connexions mobiles).
if (typeof window !== "undefined") {
  let syncToastShown = false;

  const triggerSync = () => {
    if (!syncToastShown) {
      syncToastShown = true;
      toast.info("Connexion rétablie — mise à jour des données en cours...");
      setTimeout(() => { syncToastShown = false; }, 5000); // éviter les toasts en double
    }
    console.log("🌐 Connexion rétablie, synchronisation automatique...");
    syncQueue.process();
  };

  window.addEventListener("online",          triggerSync);
  window.addEventListener("network:online",  triggerSync);
}
