/**
 * Préchargeur offline — remplit IndexedDB en arrière-plan quand l'utilisateur est en ligne.
 * Appelé une fois par session depuis le DashboardLayout.
 * Garantit que les listes (élèves, classes) sont disponibles en mode hors ligne
 * même si l'utilisateur n'a pas visité chaque page individuellement.
 */

import { offlineDB, STORES } from "./offline-db";
import { getStudents } from "./api/students.service";
import { getClasses } from "./api/classes.service";

let preloadDone = false; // Une seule fois par session navigateur

export async function preloadOfflineData(token: string): Promise<void> {
  if (preloadDone) return;
  if (!navigator.onLine) return;

  try {
    // Classes — petit dataset, toujours complet
    const classes = await getClasses(token);
    if (Array.isArray(classes) && classes.length > 0) {
      await offlineDB.clear(STORES.CLASSES);
      for (const cls of classes) {
        await offlineDB.update(STORES.CLASSES, cls);
      }
    }

    // Élèves — limite haute pour tout récupérer d'un coup
    const studentsResult = await getStudents(token, { limit: 5000 });
    const students = Array.isArray(studentsResult)
      ? studentsResult
      : (studentsResult as any)?.data ?? [];

    if (students.length > 0) {
      await offlineDB.clear(STORES.STUDENTS);
      for (const s of students) {
        await offlineDB.update(STORES.STUDENTS, s);
      }
    }

    preloadDone = true;
    console.log(
      `[Offline] Préchargement terminé — ${classes.length} classes, ${students.length} élèves`
    );
  } catch (err) {
    // Silencieux : l'app fonctionne en ligne normalement, le preload est un bonus
    console.warn("[Offline] Préchargement échoué (ignoré) :", err);
  }
}
