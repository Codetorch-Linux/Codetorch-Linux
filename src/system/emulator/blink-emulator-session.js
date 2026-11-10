/**
 * Codetorch Blink x86-64 Emulation Session Wrapper
 * Path: /src/system/emulator/blink-emulator-session.js
 * License: GNU GPL v3
 */

export class CTBlinkEmulatorSession {
  constructor(bus, overlayfs) {
    this.bus = bus || (typeof window !== "undefined" ? window.CTBus : null);
    this.overlayfs = overlayfs;
    this.blinkInstance = null;
    this.isRunning = false;
  }

  /**
   * Initializes the Blink engine and executes an x86-64 Linux ELF binary or live kernel image.
   */
  async startSession(elfPath, args = []) {
    console.log(`[Blink Emulator] Loading x86-64 ELF binary from: ${elfPath}...`);

    try {
      // 1. Fetch binary payload from ct-overlayfs or hot storage
      const binaryData = await this.overlayfs.readFile(elfPath);
      if (!binaryData) {
        throw new Error(`Binary not found at path: ${elfPath}`);
      }

      const uint8Buffer = binaryData instanceof Uint8Array 
        ? binaryData 
        : new TextEncoder().encode(binaryData);

      // 2. Load Blink WASM engine core
      const blinkModule = await import("/src/system/emulator/blink/libblink.js");
      
      const config = {
        locateFile: (path) => {
          if (path.endsWith(".wasm")) {
            return "/src/system/emulator/blink/blinkenlib.wasm";
          }
          return path;
        },
        print: (stdoutText) => {
          if (this.bus) {
            this.bus.emit("terminal:write", stdoutText + "\n");
          }
        },
        printErr: (stderrText) => {
          if (this.bus) {
            this.bus.emit("terminal:write", `\x1b[31m${stderrText}\x1b[0m\n`);
          }
        }
      };

      this.blinkInstance = await blinkModule.default(config);
      this.isRunning = true;

      // 3. Mount binary into Blink VFS and spawn process thread
      const memoryPtr = this.blinkInstance._malloc(uint8Buffer.length);
      this.blinkInstance.HEAPU8.set(uint8Buffer, memoryPtr);

      console.log("[Blink Emulator] Executing x86-64 process entry point...");
      this.blinkInstance._blink_run_main(memoryPtr, uint8Buffer.length, args);

      this.bindBusEvents();
    } catch (err) {
      console.error("[Blink Emulator] Execution failed:", err);
      if (this.bus) {
        this.bus.emit("terminal:write", `\x1b[31m[Blink Error] ${err.message}\x1b[0m\n`);
      }
    }
  }

  /**
   * Listens for keyboard and standard input events sent across ct-bus.
   */
  bindBusEvents() {
    if (!this.bus) return;

    this.bus.on("v86:send_serial", (payload) => {
      if (this.isRunning && this.blinkInstance && payload.text) {
        const encoder = new TextEncoder();
        const chars = encoder.encode(payload.text);
        chars.forEach((charByte) => {
          if (this.blinkInstance._blink_tty_write) {
            this.blinkInstance._blink_tty_write(charByte);
          }
        });
      }
    });
  }

  /**
   * Terminates the running Blink virtual machine context.
   */
  destroy() {
    if (this.blinkInstance) {
      if (this.blinkInstance._blink_kill) {
        this.blinkInstance._blink_kill();
      }
      this.blinkInstance = null;
      this.isRunning = false;
      console.log("[Blink Emulator] Session terminated.");
    }
  }
}
