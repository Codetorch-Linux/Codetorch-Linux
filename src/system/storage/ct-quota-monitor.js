/**
 * Codetorch Storage Quota Monitor Daemon
 * Path: /src/system/storage/ct-quota-monitor.js
 * License: GNU GPL v3
 */

export class CTQuotaMonitor {
  constructor(ctfs, bus) {
    this.ctfs = ctfs;
    this.bus = bus || (typeof window !== "undefined" ? window.CTBus : null);
    this.warned = false;
    this.threshold = 0.90; // 90% capacity limit
  }

  /**
   * Checks host storage capacity and triggers terminal warning if usage >= 90%.
   */
  async checkQuota() {
    if (typeof navigator === "undefined" || !navigator.storage || !navigator.storage.estimate) {
      return;
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 1;
      const usageRatio = usage / quota;
      const percentage = (usageRatio * 100).toFixed(1);

      if (usageRatio >= this.threshold) {
        if (!this.warned) {
          this.triggerQuotaWarning(usage, quota, percentage);
          this.warned = true;
        }
      } else {
        this.warned = false; // Reset warning lock if space is reclaimed
      }
    } catch (err) {
      console.warn("[ct-quota-monitor] Failed to check storage estimate:", err);
    }
  }

  /**
   * Emits formatted terminal alert payload to ct-bus subscribers.
   */
  triggerQuotaWarning(usageBytes, quotaBytes, percentageStr) {
    const usageMB = (usageBytes / (1024 * 1024)).toFixed(1);
    const quotaMB = (quotaBytes / (1024 * 1024)).toFixed(1);

    const warningMessage = `
\x1b[31;1m┌────────────────────────────────────────────────────────────────────────┐\x1b[0m
\x1b[31;1m│ [CRITICAL STORAGE WARNING] IndexedDB Hot Tier is ${percentageStr.padStart(5)}% Full!       │\x1b[0m
\x1b[31;1m├────────────────────────────────────────────────────────────────────────┤\x1b[0m
\x1b[33m│ Used: ${usageMB.padStart(8)} MB / Allocated Quota: ${quotaMB.padStart(8)} MB                   │\x1b[0m
\x1b[33m│ Browser storage limits are near capacity.                              │\x1b[0m
\x1b[33m│                                                                        │\x1b[0m
\x1b[37m│ Action Required:                                                       │\x1b[0m
\x1b[32m│  1. Attach remote URL storage:   hddach server <url>                   │\x1b[0m
\x1b[32m│  2. Save local backup to host:    hddach save                          │\x1b[0m
\x1b[32m│  3. Purge hot tier cache:         hddach indexdb wipe                  │\x1b[0m
\x1b[31;1m└────────────────────────────────────────────────────────────────────────┘\x1b[0m
`;

    console.warn(`[ct-quota-monitor] Storage quota warning triggered: ${percentageStr}% used.`);

    if (this.bus) {
      this.bus.emit("terminal:write", warningMessage);
      this.bus.emit("system:quota_exceeded", {
        usage: usageBytes,
        quota: quotaBytes,
        percentage: percentageStr
      });
    }
  }
}
