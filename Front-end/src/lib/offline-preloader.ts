/**
 * Préchargeur offline — remplit IndexedDB en arrière-plan quand l'utilisateur est en ligne.
 * Appelé une fois par session depuis le DashboardLayout.
 * Garantit que toutes les données critiques sont disponibles hors ligne
 * même si l'utilisateur n'a pas visité chaque page individuellement.
 */

import { offlineDB, STORES } from "./offline-db";
import { getStudents } from "./api/students.service";
import { getClasses } from "./api/classes.service";
import { getPayments } from "./api/payments.service";
import { getAttendances } from "./api/attendance.service";
// getGrades supprimé — replaced by Evaluation/Composition APIs

// Promise en cours : évite les appels parallèles (ex: montage + retour online simultanés)
let runningPreload: Promise<void> | null = null;

async function preloadStore<T>(
  storeName: string,
  fetcher: () => Promise<T[]>,
  label: string
): Promise<number> {
  try {
    const items = await fetcher();
    if (Array.isArray(items) && items.length > 0) {
      await offlineDB.clear(storeName);
      await offlineDB.bulkAdd(storeName, items);
    }
    return Array.isArray(items) ? items.length : 0;
  } catch (err) {
    console.warn(`[Offline] Préchargement ${label} échoué (ignoré) :`, err);
    return 0;
  }
}

export function preloadOfflineData(token: string): Promise<void> {
  if (!navigator.onLine) return Promise.resolve();

  // Si un preload est déjà en cours, on attend le même (pas d'appels parallèles)
  if (runningPreload) return runningPreload;

  runningPreload = (async () => {
    try {
      // Classes et élèves en premier (bloquant — nécessaires pour toutes les pages)
      const classes = await getClasses(token);
      if (Array.isArray(classes) && classes.length > 0) {
        await offlineDB.clear(STORES.CLASSES);
        await offlineDB.bulkAdd(STORES.CLASSES, classes);
      }

      const studentsResult = await getStudents(token, { limit: 5000 });
      const students = Array.isArray(studentsResult)
        ? studentsResult
        : (studentsResult as any)?.data ?? [];

      if (students.length > 0) {
        await offlineDB.clear(STORES.STUDENTS);
        await offlineDB.bulkAdd(STORES.STUDENTS, students);
      }

      // Données secondaires en parallèle (non bloquantes)
      const [paymentsCount, attendanceCount] = await Promise.all([
        preloadStore(STORES.PAYMENTS, () => getPayments(token), "paiements"),
        preloadStore(STORES.ATTENDANCE, () => getAttendances(token), "présences"),
      ]);

      console.log(
        `[Offline] Préchargement terminé — ${classes.length} classes, ${students.length} élèves, ` +
        `${paymentsCount} paiements, ${attendanceCount} présences`
      );
    } catch (err) {
      // Silencieux : l'app fonctionne en ligne normalement, le preload est un bonus
      console.warn("[Offline] Préchargement échoué (ignoré) :", err);
    } finally {
      runningPreload = null; // Libérer pour permettre un prochain appel (ex: retour online)
    }
  })();

  return runningPreload;
}
