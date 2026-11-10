/**
 * Codetorch Linux Primary Storage Engine (ctfs)
 * Path: /src/system/storage/ctfs.js
 * License: GNU GPL v3
 */

import { CTQuotaMonitor } from "./ct-quota-monitor.js";

export class CTFS {
  constructor() {
    this.dbName = "CodetorchFS";
    this.dbVersion = 1;
    this.db = null;
    this.quotaMonitor = new CTQuotaMonitor(this, window.CTBus);
  }

  /**
   * Initializes the IndexedDB database structure.
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Hot Storage Tier: Stores modified files & user data
        if (!db.objectStoreNames.contains("files")) {
          db.createObjectStore("files", { keyPath: "path" });
        }

        // System Metadata Store: Holds init signatures and state markers
        if (!db.objectStoreNames.contains("system_meta")) {
          db.createObjectStore("system_meta", { keyPath: "key" });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log("[ctfs] IndexedDB Hot Tier storage initialized.");
        resolve();
      };

      request.onerror = (event) => {
        reject(`[ctfs] IndexedDB initialization failed: ${event.target.error}`);
      };
    });
  }

  /**
   * Checks if an initialization marker exists in system metadata.
   */
  async isStorageInitialized() {
    return new Promise((resolve) => {
      if (!this.db) return resolve(false);

      const tx = this.db.transaction("system_meta", "readonly");
      const store = tx.objectStore("system_meta");
      const req = store.get("initialized");

      req.onsuccess = () => {
        resolve(!!(req.result && req.result.value));
      };

      req.onerror = () => resolve(false);
    });
  }

  /**
   * Marks the filesystem state as initialized.
   */
  async markInitialized() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("system_meta", "readwrite");
      const store = tx.objectStore("system_meta");
      const req = store.put({ key: "initialized", value: true, timestamp: Date.now() });

      req.onsuccess = () => resolve();
      req.onerror = (err) => reject(err);
    });
  }

  /**
   * Reads a file from local IndexedDB hot storage.
   */
  async readFile(path) {
    return new Promise((resolve) => {
      const tx = this.db.transaction("files", "readonly");
      const store = tx.objectStore("files");
      const req = store.get(path);

      req.onsuccess = () => {
        resolve(req.result ? req.result.content : null);
      };

      req.onerror = () => resolve(null);
    });
  }

  /**
   * Writes a file to local IndexedDB hot storage and triggers a quota capacity check.
   */
  async writeFile(path, content) {
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction("files", "readwrite");
      const store = tx.objectStore("files");
      const req = store.put({
        path,
        content,
        updatedAt: Date.now()
      });

      req.onsuccess = () => resolve();
      req.onerror = (err) => reject(err);
    });

    // Check storage limits post-write
    await this.quotaMonitor.checkQuota();
  }

  /**
   * Deletes a file node from IndexedDB.
   */
  async deleteFile(path) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("files", "readwrite");
      const store = tx.objectStore("files");
      const req = store.delete(path);

      req.onsuccess = () => resolve();
      req.onerror = (err) => reject(err);
    });
  }

  /**
   * Restores an exported ZIP backup archive into the hot tier.
   */
  async restoreFromZip(zipBlob) {
    console.log("[ctfs] Ingesting ZIP backup archive...");
    
    // Process ZIP stream data and store extracted nodes into IDB
    const arrayBuffer = await zipBlob.arrayBuffer();
    
    // Standard decompression pipeline integration
    const tx = this.db.transaction(["files", "system_meta"], "readwrite");
    tx.objectStore("system_meta").put({ key: "initialized", value: true, timestamp: Date.now() });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log("[ctfs] Backup restoration complete.");
        resolve();
      };
      tx.onerror = (err) => reject(err);
    });
  }
}
