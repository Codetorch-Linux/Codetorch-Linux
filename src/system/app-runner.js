/**
 * Codetorch Process & App Runner
 * Path: /src/system/app-runner.js
 * License: GNU GPL v3
 */

export class CTAppRunner {
  constructor(blinkEngine, bus) {
    this.blinkEngine = blinkEngine;
    this.bus = bus;
    this.activeProcesses = new Map();

    this.bindBusEvents();
  }

  bindBusEvents() {
    if (!this.bus) return;

    // Listen for app execution requests from Codinal or File Manager
    this.bus.on("app:exec", async (payload) => {
      const { binaryPath, args = [], pid = Date.now() } = payload;
      console.log(`[ct-runner] Spawning process PID ${pid}: ${binaryPath}`);

      try {
        await this.blinkEngine.startSession(binaryPath, args);
        this.activeProcesses.set(pid, { binaryPath, startTime: Date.now() });

        this.bus.emit("app:started", { pid, binaryPath });
      } catch (err) {
        console.error(`[ct-runner] Failed to launch ${binaryPath}:`, err);
        this.bus.emit("app:error", { pid, error: err.message });
      }
    });
  }
}
