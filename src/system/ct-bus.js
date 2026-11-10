/**
 * Codetorch Inter-Process Communication (IPC) Bus Engine (ct-bus)
 * Path: /src/system/ct-bus.js
 * License: GNU GPL v3
 */

export class CTBus {
  constructor() {
    this.listeners = new Map();
    this.channel = typeof BroadcastChannel !== "undefined" 
      ? new BroadcastChannel("ct_system_bus") 
      : null;
    this.workerPortMap = new Map();

    // Listen for system-wide broadcast events across tabs/workers
    if (this.channel) {
      this.channel.onmessage = (event) => {
        const { topic, payload } = event.data || {};
        if (topic) {
          this._dispatchLocal(topic, payload, false);
        }
      };
    }
  }

  /**
   * Registers an event listener on the IPC bus.
   */
  on(topic, handler) {
    if (!this.listeners.has(topic)) {
      this.listeners.set(topic, new Set());
    }
    this.listeners.get(topic).add(handler);

    return () => this.off(topic, handler);
  }

  /**
   * Unregisters an event listener.
   */
  off(topic, handler) {
    if (this.listeners.has(topic)) {
      this.listeners.get(topic).delete(handler);
    }
  }

  /**
   * Emits an event across both local subscribers and system BroadcastChannel.
   */
  emit(topic, payload) {
    this._dispatchLocal(topic, payload, true);
    
    if (this.channel) {
      try {
        this.channel.postMessage({ topic, payload });
      } catch (err) {
        console.warn(`[ct-bus] Broadcast publish error on ${topic}:`, err);
      }
    }
  }

  /**
   * Binds a target Web Worker instance to the system IPC channel.
   */
  registerWorker(workerId, worker) {
    this.workerPortMap.set(workerId, worker);

    worker.addEventListener("message", (e) => {
      const { topic, payload } = e.data || {};
      if (topic) {
        this.emit(topic, payload);
      }
    });

    console.log(`[ct-bus] Web Worker registered: ${workerId}`);
  }

  /**
   * Sends a targeted payload directly to a registered worker.
   */
  sendToWorker(workerId, topic, payload) {
    const worker = this.workerPortMap.get(workerId);
    if (worker) {
      worker.postMessage({ topic, payload });
    } else {
      console.error(`[ct-bus] Target worker '${workerId}' not registered.`);
    }
  }

  /**
   * Internal dispatcher for executing local event handlers.
   */
  _dispatchLocal(topic, payload, isOrigin) {
    if (this.listeners.has(topic)) {
      this.listeners.get(topic).forEach((handler) => {
        try {
          handler(payload, { isOrigin });
        } catch (err) {
          console.error(`[ct-bus] Exception in handler for topic '${topic}':`, err);
        }
      });
    }
  }
}

// Global Singleton Binding for System Access
if (typeof window !== "undefined") {
  window.CTBus = window.CTBus || new CTBus();
}
