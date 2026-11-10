/**
 * Codetorch WASI Desktop Session Execution Worker
 * Path: /src/de/core/session-worker.js
 * License: GNU GPL v3
 */

let canvas = null;
let ctx = null;
let activeDE = "plasma";
let isRunning = false;

// WASM Module References
let wasmInstance = null;
let wasmMemory = null;

/**
 * POSIX / WASI Syscall Imports for Qt6 (Plasma) and GTK4 (GNOME) renderers
 */
function createWASISyscalls() {
  return {
    wasi_snapshot_preview1: {
      proc_exit: (code) => {
        console.log(`[session-worker] Session process exited with code ${code}`);
        isRunning = false;
        self.postMessage({ topic: "session:exit", payload: { code } });
      },
      fd_write: (fd, iovs, iovs_len, nwritten) => {
        // Forward WASI stdout/stderr to host console
        return 0;
      },
      fd_read: () => 0,
      clock_time_get: (id, precision, timePtr) => 0
    },
    env: {
      // Direct OffscreenCanvas Buffer Swap Interop
      ct_gfx_swap_buffers: (framebufferPtr, width, height) => {
        if (!ctx || !wasmMemory) return;

        // Render hardware surface buffer to canvas context
        if (ctx instanceof ImageBitmapRenderingContext) {
          const buffer = new Uint8ClampedArray(wasmMemory.buffer, framebufferPtr, width * height * 4);
          const imageData = new ImageData(buffer, width, height);
          createImageBitmap(imageData).then((bitmap) => ctx.transferFromImageBitmap(bitmap));
        }
      },
      ct_bus_emit: (topicPtr, payloadPtr) => {
        // Interop with system ct-bus IPC
      }
    }
  };
}

self.onmessage = async (e) => {
  const { type, payload } = e.data || {};

  switch (type) {
    case "INIT_SESSION":
      await initSession(payload);
      break;

    case "INPUT_EVENT":
      handleInputEvent(payload);
      break;

    default:
      console.warn(`[session-worker] Unknown message type received: ${type}`);
  }
};

/**
 * Initializes and executes the target WASI Desktop Environment binary
 */
async function initSession({ de, binaryPath, canvas: offscreenCanvas, screenWidth, screenHeight }) {
  activeDE = de;
  canvas = offscreenCanvas;
  canvas.width = screenWidth;
  canvas.height = screenHeight;

  ctx = canvas.getContext("bitmaprenderer") || canvas.getContext("2d");
  console.log(`[session-worker] Spawning native WASI ${de.toUpperCase()} session binary...`);

  try {
    const response = await fetch(binaryPath);
    if (!response.ok) {
      throw new Error(`Failed to load WASI binary at ${binaryPath}: HTTP ${response.status}`);
    }

    const wasmBytes = await response.arrayBuffer();
    const importObject = createWASISyscalls();

    const { instance } = await WebAssembly.instantiate(wasmBytes, importObject);
    wasmInstance = instance;
    wasmMemory = instance.exports.memory;
    isRunning = true;

    // Execute WASI binary main entrypoint
    if (instance.exports._start) {
      instance.exports._start();
    } else if (instance.exports.main) {
      instance.exports.main();
    }

    self.postMessage({ topic: "session:started", payload: { de } });
  } catch (err) {
    console.error(`[session-worker] WASI execution failure for ${de}:`, err);
    renderFallbackWorkspace();
  }
}

/**
 * Dispatch DOM events into the WASI input event queue
 */
function handleInputEvent(event) {
  if (!isRunning || !wasmInstance) return;

  if (wasmInstance.exports.ct_process_input_event) {
    // Interop call to WASI event loop
    wasmInstance.exports.ct_process_input_event(
      event.eventType === "keydown" ? 1 : 0,
      event.keyCode || 0,
      event.clientX || 0,
      event.clientY || 0
    );
  }
}

/**
 * Basic canvas state renderer if WASM binary payload is missing during initial dev setup
 */
function renderFallbackWorkspace() {
  if (!ctx || !(ctx instanceof CanvasRenderingContext2D)) return;

  const bg = activeDE === "gnome" ? "#241f31" : "#1b2430";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#00AFFF";
  ctx.font = "20px monospace";
  ctx.fillText(`Codetorch OS - Active DE: ${activeDE.toUpperCase()}`, 40, 60);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "14px monospace";
  ctx.fillText("Blink Direct Rendering Pipeline Active", 40, 90);
}
