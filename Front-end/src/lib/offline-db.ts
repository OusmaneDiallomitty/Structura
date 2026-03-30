/**
 * Système de base de données locale pour mode hors ligne
 * Utilise IndexedDB pour stocker les données critiques
 */

import type { Student, Class, Payment, Attendance, Grade } from "@/types";

const DB_NAME = "StructuraDB";
const DB_VERSION = 1;

// Stores (tables)
const STORES = {
  STUDENTS: "students",
  CLASSES: "classes",
  PAYMENTS: "payments",
  ATTENDANCE: "attendance",
  GRADES: "grades",
  SYNC_QUEUE: "syncQueue",
} as const;

class OfflineDB {
  private db: IDBDatabase | null = null;

  /**
   * Initialiser la base de données
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Créer les stores si ils n'existent pas
        if (!db.objectStoreNames.contains(STORES.STUDENTS)) {
          const studentsStore = db.createObjectStore(STORES.STUDENTS, {
            keyPath: "id",
          });
          studentsStore.createIndex("name", "name", { unique: false });
          studentsStore.createIndex("class", "class", { unique: false });
          studentsStore.createIndex("needsSync", "needsSync", {
            unique: false,
          });
        }

        if (!db.objectStoreNames.contains(STORES.CLASSES)) {
          db.createObjectStore(STORES.CLASSES, { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains(STORES.PAYMENTS)) {
          const paymentsStore = db.createObjectStore(STORES.PAYMENTS, {
            keyPath: "id",
          });
          paymentsStore.createIndex("studentId", "studentId", {
            unique: false,
          });
          paymentsStore.createIndex("needsSync", "needsSync", {
            unique: false,
          });
        }

        if (!db.objectStoreNames.contains(STORES.ATTENDANCE)) {
          const attendanceStore = db.createObjectStore(STORES.ATTENDANCE, {
            keyPath: "id",
          });
          attendanceStore.createIndex("studentId", "studentId", {
            unique: false,
          });
          attendanceStore.createIndex("date", "date", { unique: false });
          attendanceStore.createIndex("needsSync", "needsSync", {
            unique: false,
          });
        }

        if (!db.objectStoreNames.contains(STORES.GRADES)) {
          const gradesStore = db.createObjectStore(STORES.GRADES, {
            keyPath: "id",
          });
          gradesStore.createIndex("studentId", "studentId", { unique: false });
          gradesStore.createIndex("needsSync", "needsSync", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
          db.createObjectStore(STORES.SYNC_QUEUE, {
            keyPath: "id",
            autoIncrement: true,
          });
        }
      };
    });
  }

  /**
   * Ajouter un élément dans un store
   */
  async add<T>(storeName: string, data: T): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.add(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Mettre à jour un élément
   */
  async update<T>(storeName: string, data: T): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Récupérer tous les éléments d'un store
   */
  async getAll<T>(storeName: string): Promise<T[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (e) {
        // InvalidStateError : connexion en fermeture (navigation) — retourner vide
        if (e instanceof DOMException && e.name === "InvalidStateError") {
          this.db = null; // forcer re-init au prochain appel
          resolve([]);
        } else {
          reject(e);
        }
      }
    });
  }

  /**
   * Récupérer un élément par ID
   */
  async getById<T>(storeName: string, id: string | number): Promise<T | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Supprimer un élément
   */
  async delete(storeName: string, id: string | number): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Récupérer les éléments qui nécessitent une synchronisation
   */
  async getNeedsSync<T>(storeName: string): Promise<T[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], "readonly");
      const store = transaction.objectStore(storeName);
      
      // Vérifier si l'index existe
      if (!store.indexNames.contains("needsSync")) {
        resolve([]);
        return;
      }
      
      const index = store.index("needsSync");
      const request = index.getAll(IDBKeyRange.only(true));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Sauvegarder plusieurs éléments en une fois
   */
  async bulkAdd<T>(storeName: string, items: T[]): Promise<void> {
    if (!this.db) await this.init();
    if (items.length === 0) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);

      // Utilise put (upsert) au lieu de add pour éviter l'erreur si l'élément existe déjà
      transaction.oncomplete = () => resolve();
      transaction.onerror   = () => reject(transaction.error);
      transaction.onabort   = () => reject(transaction.error);

      for (const item of items) {
        store.put(item);
      }
    });
  }

  /**
   * Vider un store
   */
  async clear(storeName: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Vider tous les stores — appelé au logout pour éviter les fuites de données entre sessions.
   * Les erreurs par store sont ignorées (fail-safe) pour ne pas bloquer la déconnexion.
   */
  async clearAll(): Promise<void> {
    await Promise.allSettled(
      Object.values(STORES).map((storeName) => this.clear(storeName))
    );
  }
}

// Instance singleton
export const offlineDB = new OfflineDB();

// Initialiser au chargement
if (typeof window !== "undefined") {
  offlineDB.init().catch(console.error);
}

// Exports des noms de stores
export { STORES };
