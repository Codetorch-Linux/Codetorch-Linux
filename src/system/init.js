/**
 * Codetorch Linux Kernel Init & Session Bootloader
 * Path: /src/system/init.js
 * License: GNU GPL v3
 */

import { CTFS } from "./storage/ctfs.js";
import { CTOverlayFS } from "./storage/ct-overlayfs.js";
import { CTBlinkSessionManager } from "../de/core/blink-session.js";

class KernelInitializer {
  constructor() {
    this.ctfs = null;
    this.overlayfs = null;
    this.sessionManager = null;
    this.bootSplash = document.getElementById("boot-splash");
    this.bootStatus = document.getElementById("boot-status");
    this.storageModal = document.getElementById("ct-storage-modal");
  }

  async boot() {
    this.updateStatus("Initializing ct-bus & System Storage...");

    // 1. Initialize Primary Filesystem (ctfs)
    this.ctfs = new CTFS();
    await this.ctfs.init();

    // 2. Check for Saved Storage URL or Existing Storage Signature
    const savedStorageURL = localStorage.getItem("ct_storage_server_url");
    const isDBInitialized = await this.ctfs.isStorageInitialized();

    if (!isDBInitialized && !savedStorageURL) {
      // First boot or wiped browser data: Pause boot & display setup modal
      this.updateStatus("Awaiting Storage Configuration...");
      this.showStorageModal();
    } else {
      // Existing session or saved URL found: Proceed with mount & desktop boot
      await this.continueBootSequence(savedStorageURL);
    }
  }

  showStorageModal() {
    this.storageModal.classList.remove("hidden");

    const remoteInput = document.getElementById("remote-url-input");
    const zipInput = document.getElementById("zip-backup-input");
    const btnFresh = document.getElementById("btn-start-fresh");

    // Fresh OS Start Handler
    btnFresh.addEventListener("click", async () => {
      const url = remoteInput.value.trim();
      if (url) {
        localStorage.setItem("ct_storage_server_url", url);
      }
      this.storageModal.classList.add("hidden");
      await this.ctfs.markInitialized();
      await this.continueBootSequence(url);
    });

    // Restore Backup Handler
    zipInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (file) {
        this.updateStatus("Restoring backup archive...");
        this.storageModal.classList.add("hidden");
        await this.ctfs.restoreFromZip(file);
        await this.continueBootSequence(remoteInput.value.trim());
      }
    });
  }

  async continueBootSequence(remoteStorageURL) {
    this.updateStatus("Mounting ct-overlayfs (Steam, Tor, VirtualBox)...");

    // 3. Mount Read-Only Overlay Image
    this.overlayfs = new CTOverlayFS(this.ctfs, remoteStorageURL || "/system/base-rootfs");
    await this.overlayfs.init();

    this.updateStatus("Launching Desktop Session worker...");

    // 4. Initialize Desktop Engine (KDE Plasma or GNOME inside Blink)
    this.sessionManager = new CTBlinkSessionManager(this.overlayfs);
    await this.sessionManager.bootSession();

    // 5. Fade out splash screen once desktop viewport is alive
    this.updateStatus("System Ready.");
    setTimeout(() => {
      if (this.bootSplash) {
        this.bootSplash.style.opacity = "0";
        setTimeout(() => this.bootSplash.classList.add("hidden"), 500);
      }
    }, 300);
  }

  updateStatus(text) {
    if (this.bootStatus) {
      this.bootStatus.textContent = text;
    }
    console.log(`[kernel init] ${text}`);
  }
}

// Instantiate and launch system kernel on DOM Ready
window.addEventListener("DOMContentLoaded", () => {
  window.CodetorchKernel = new KernelInitializer();
  window.CodetorchKernel.boot().catch(err => {
    console.error("[Kernel Panic]", err);
  });
});
