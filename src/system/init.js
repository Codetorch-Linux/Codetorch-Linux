/**
 * Codetorch Linux Kernel Bootloader & Runtime Initializer
 * Path: /src/system/init.js
 * License: GNU GPL v3
 */

import { CTFS } from "./storage/ctfs.js";
import { CTOverlayFS } from "./storage/ct-overlayfs.js";
import { CTBus } from "./ct-bus.js";
import { CTQuotaMonitor } from "./storage/ct-quota-monitor.js";
import { CTBlinkEmulatorSession } from "./emulator/blink-emulator-session.js";
import { CTV86Session } from "./emulator/v86-session.js";
import { CodinalTerminal } from "../apps/ct-term/terminal.js";
import { CTFSFileManager } from "../apps/ctfs-gui/app.js";
import { CTSettingsManager } from "../apps/ct-settings/app.js";

export class CodetorchInit {
  constructor() {
    this.bus = new CTBus();
    this.ctfs = null;
    this.overlayfs = null;
    this.quotaMonitor = null;
    this.blinkEngine = null;
    this.v86Display = null;
  }

  async boot() {
    console.log("[init] Starting Codetorch Linux boot sequence...");

    // 1. Initialize IPC & Multi-tiered Storage Systems
    this.ctfs = new CTFS();
    await this.ctfs.init();

    this.overlayfs = new CTOverlayFS("/system/base-rootfs");
    await this.overlayfs.init();

    this.quotaMonitor = new CTQuotaMonitor(this.ctfs, this.bus);
    this.quotaMonitor.start();

    // 2. Initialize Core Applications
    this.initApps();

    // 3. Boot Primary OS Engine (Blink)
    this.blinkEngine = new CTBlinkEmulatorSession(this.bus, this.overlayfs);

    // 4. Initialize v86 as Dedicated Screen Output Renderer
    this.v86Display = new CTV86Session("screen-container", this.bus);

    // Check system DE configuration to launch environment
    const deConfig = await this.ctfs.readFile("/etc/de.conf");
    const deName = deConfig ? new TextDecoder().decode(deConfig).trim() : "plasma";

    console.log(`[init] Launching ${deName.toUpperCase()} desktop shell on Blink OS engine...`);
    
    // Start display layer on v86 canvas context
    await this.v86Display.startSession({
      autostart: true
    });

    // Start OS execution on Blink core engine
    await this.blinkEngine.startSession(`/system/base-rootfs/bin/${deName}-desktop.wasm`);

    this.hideSplashScreen();
  }

  initApps() {
    // Mount built-in apps into DOM windows if elements exist
    if (document.getElementById("terminal-container")) {
      new CodinalTerminal("terminal-container", this.ctfs, this.bus);
    }
    if (document.getElementById("file-manager-container")) {
      new CTFSFileManager("file-manager-container", this.ctfs, this.overlayfs, this.bus);
    }
    if (document.getElementById("settings-container")) {
      new CTSettingsManager("settings-container", this.ctfs, this.bus);
    }
  }

  hideSplashScreen() {
    const splash = document.getElementById("splash-screen");
    if (splash) {
      splash.style.opacity = "0";
      setTimeout(() => splash.remove(), 500);
    }
  }
}

// Auto-boot on DOM ready
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    const system = new CodetorchInit();
    system.boot();
  });
}
