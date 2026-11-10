/**
 * Codetorch Native Blink Desktop Session Manager
 * Path: /src/de/core/blink-session.js
 * License: GNU GPL v3
 */

export class CTBlinkSessionManager {
  constructor(overlayfs) {
    this.overlayfs = overlayfs;
    this.activeWorker = null;
    this.canvasContainer = document.getElementById("ct-de-viewport");
  }

  /**
   * Reads desktop environment configuration and spawns target WASI worker.
   */
  async bootSession() {
    // 1. Read configured desktop environment (default to Plasma)
    const confData = await this.overlayfs.readFile("/etc/de.conf");
    let targetDE = "plasma";

    if (confData) {
      const text = typeof confData === "string" 
        ? confData 
        : new TextDecoder().decode(confData);
      targetDE = text.trim().toLowerCase();
    }

    console.log(`[Blink Session] Initializing native ${targetDE.toUpperCase()} inside Blink...`);

    // 2. Prepare HTML5 canvas element in view container
    if (!this.canvasContainer) {
      this.canvasContainer = document.createElement("div");
      this.canvasContainer.id = "ct-de-viewport";
      document.body.appendChild(this.canvasContainer);
    }
    this.canvasContainer.innerHTML = "";

    const canvas = document.createElement("canvas");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.canvasContainer.appendChild(canvas);

    const offscreen = canvas.transferControlToOffscreen();

    // 3. Map environment target to binary bundle path
    const wasiBinary = targetDE === "gnome" 
      ? "/usr/bin/gnome-shell.wasm" 
      : "/usr/bin/plasma-desktop.wasm";

    // 4. Instantiate Web Worker session runner
    this.activeWorker = new Worker("/src/de/core/session-worker.js", { type: "module" });

    if (window.CTBus) {
      window.CTBus.registerWorker("session-worker", this.activeWorker);
    }

    // 5. Transfer canvas ownership & initial screen geometry to worker
    this.activeWorker.postMessage({
      type: "INIT_SESSION",
      payload: {
        de: targetDE,
        binaryPath: wasiBinary,
        canvas: offscreen,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight
      }
    }, [offscreen]);

    // 6. Bind DOM hardware input listeners
    this.attachInputListeners();
  }

  /**
   * Forwards host browser input events into the WASI event queue.
   */
  attachInputListeners() {
    const sendEvent = (eventType, e) => {
      if (!this.activeWorker) return;
      this.activeWorker.postMessage({
        type: "INPUT_EVENT",
        payload: {
          eventType,
          clientX: e.clientX,
          clientY: e.clientY,
          key: e.key,
          keyCode: e.keyCode,
          button: e.button
        }
      });
    };

    window.addEventListener("pointerdown", (e) => sendEvent("pointerdown", e));
    window.addEventListener("pointermove", (e) => sendEvent("pointermove", e));
    window.addEventListener("pointerup", (e) => sendEvent("pointerup", e));
    window.addEventListener("keydown", (e) => sendEvent("keydown", e));
    window.addEventListener("keyup", (e) => sendEvent("keyup", e));

    window.addEventListener("resize", () => {
      if (!this.activeWorker) return;
      this.activeWorker.postMessage({
        type: "RESIZE",
        payload: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      });
    });
  }
}
