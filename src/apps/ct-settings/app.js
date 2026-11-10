/**
 * Codetorch System Settings & Control Panel (ct-settings)
 * Path: /src/apps/ct-settings/app.js
 * License: GNU GPL v3
 */

export class CTSettingsManager {
  constructor(containerId, ctfs, bus) {
    this.container = document.getElementById(containerId);
    this.ctfs = ctfs;
    this.bus = bus || (typeof window !== "undefined" ? window.CTBus : null);

    this.activeTab = "display";
    this.initDOM();
    this.bindEvents();
    this.loadSettings();
  }

  initDOM() {
    if (!this.container) return;

    this.container.classList.add("ct-settings-app");
    this.container.innerHTML = `
      <div class="settings-sidebar">
        <div class="sidebar-title">Control Panel</div>
        <button class="nav-tab active" data-tab="display">🖥️ Display & DE</button>
        <button class="nav-tab" data-tab="storage">💾 Storage & Quota</button>
        <button class="nav-tab" data-tab="network">🌐 Network & Proxy</button>
        <button class="nav-tab" data-tab="system">⚙️ System Info</button>
      </div>

      <div class="settings-content">
        <!-- Display & DE Section -->
        <section id="tab-display" class="tab-pane active">
          <h2>Display & Desktop Environment</h2>
          <div class="form-group">
            <label for="setting-de">Target Desktop Environment:</label>
            <select id="setting-de">
              <option value="plasma">KDE Plasma (WASI)</option>
              <option value="gnome">GNOME Shell (WASI)</option>
            </select>
            <p class="help-text">Requires system reboot to re-instantiate session runner worker.</p>
          </div>
          <div class="form-group">
            <label for="setting-theme">UI Theme Variant:</label>
            <select id="setting-theme">
              <option value="breeze-dark">Breeze Dark (Default)</option>
              <option value="breeze-light">Breeze Light</option>
              <option value="adwaita-dark">Adwaita Dark</option>
              <option value="adwaita-light">Adwaita Light</option>
            </select>
          </div>
          <button id="btn-save-display" class="btn-primary">Apply Display Settings</button>
        </section>

        <!-- Storage & Quota Section -->
        <section id="tab-storage" class="tab-pane">
          <h2>Storage & Hot Tier Quota</h2>
          <div class="storage-info-box">
            <div class="info-row"><span>IndexedDB Used:</span> <strong id="lbl-storage-used">Calculating...</strong></div>
            <div class="info-row"><span>Allocated Quota:</span> <strong id="lbl-storage-quota">Calculating...</strong></div>
            <div class="info-row"><span>Capacity Bar:</span></div>
            <div class="progress-bar-bg"><div id="storage-progress" class="progress-bar-fill"></div></div>
          </div>
          <div class="form-group">
            <label for="setting-remote-url">Persistent Remote Storage Server URL:</label>
            <input type="text" id="setting-remote-url" placeholder="https://storage.codetorch.org/user-rootfs" />
            <p class="help-text">Persists across browser data wipes. Connects read-only HTTP Range base images.</p>
          </div>
          <div class="button-row">
            <button id="btn-save-storage" class="btn-primary">Save Remote Server</button>
            <button id="btn-export-backup" class="btn-secondary">📦 Export ZIP Backup</button>
            <button id="btn-wipe-idb" class="btn-danger">⚠️ Wipe Hot Tier Cache</button>
          </div>
        </section>

        <!-- Network Section -->
        <section id="tab-network" class="tab-pane">
          <h2>Network & WebSocket Proxy</h2>
          <div class="form-group">
            <label for="setting-ws-proxy">POSIX Socket WebSocket Proxy URL:</label>
            <input type="text" id="setting-ws-proxy" placeholder="wss://netproxy.codetorch.org:8443" />
            <p class="help-text">Bridges raw WASI POSIX socket connections over WebSocket to host endpoints.</p>
          </div>
          <div class="form-group">
            <label>WebRTC Mesh Status:</label>
            <div id="net-p2p-status" class="status-badge badge-inactive">P2P Disconnected</div>
          </div>
          <button id="btn-connect-net" class="btn-primary">Connect Socket Proxy</button>
        </section>

        <!-- System Section -->
        <section id="tab-system" class="tab-pane">
          <h2>System Information</h2>
          <div class="sys-info-card">
            <div><strong>OS:</strong> Codetorch Linux v1.0.0 (x86_64 WASI)</div>
            <div><strong>Compositor:</strong> Blink Direct Rendering Pipeline</div>
            <div><strong>Filesystem:</strong> ct-overlayfs (IndexedDB + HTTP Range)</div>
            <div><strong>License:</strong> GNU GPL v3</div>
            <div><strong>Kernel Memory Limit:</strong> SharedArrayBuffer (4GB max)</div>
          </div>
          <button id="btn-reboot-system" class="btn-warning">🔄 Reboot OS</button>
        </section>
      </div>
    `;

    this.contentEl = this.container.querySelector(".settings-content");
  }

  bindEvents() {
    if (!this.container) return;

    // Sidebar Tab Switching
    const tabs = this.container.querySelectorAll(".nav-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        this.container.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));

        tab.classList.add("active");
        const targetPane = this.container.querySelector(`#tab-${tab.dataset.tab}`);
        if (targetPane) targetPane.classList.add("active");

        if (tab.dataset.tab === "storage") {
          this.refreshStorageUsage();
        }
      });
    });

    // Display & DE Handler
    this.container.querySelector("#btn-save-display").addEventListener("click", async () => {
      const deSelect = this.container.querySelector("#setting-de").value;
      const themeSelect = this.container.querySelector("#setting-theme").value;

      const encoder = new TextEncoder();
      await this.ctfs.writeFile("/etc/de.conf", encoder.encode(deSelect));
      await this.ctfs.writeFile("/etc/theme.conf", encoder.encode(themeSelect));

      if (this.bus) {
        this.bus.emit("system:theme_changed", { theme: themeSelect });
      }

      alert(`Settings saved! Active DE target set to ${deSelect.toUpperCase()}.\nReboot system to apply engine changes.`);
    });

    // Storage Server Handler
    this.container.querySelector("#btn-save-storage").addEventListener("click", () => {
      const url = this.container.querySelector("#setting-remote-url").value.trim();
      if (url) {
        localStorage.setItem("ct_storage_server_url", url);
        alert(`Remote storage server URL saved: ${url}`);
      } else {
        localStorage.removeItem("ct_storage_server_url");
        alert("Remote storage server removed.");
      }
    });

    // Export Backup Handler
    this.container.querySelector("#btn-export-backup").addEventListener("click", () => {
      if (this.bus) {
        this.bus.emit("terminal:execute", "hddach save");
      }
    });

    // Wipe IDB Handler
    this.container.querySelector("#btn-wipe-idb").addEventListener("click", () => {
      if (confirm("Are you sure you want to purge local IndexedDB hot storage? Unsaved changes will be lost.")) {
        const indexedDB = window.indexedDB || self.indexedDB;
        if (indexedDB) {
          indexedDB.deleteDatabase("CodetorchFS");
        }
        window.location.reload();
      }
    });

    // Network Connect Handler
    this.container.querySelector("#btn-connect-net").addEventListener("click", () => {
      const wsUrl = this.container.querySelector("#setting-ws-proxy").value.trim();
      if (wsUrl && this.bus) {
        this.bus.emit("net:connect_ws", { url: wsUrl });
        alert(`Initiated socket proxy connection to: ${wsUrl}`);
      }
    });

    // Reboot Handler
    this.container.querySelector("#btn-reboot-system").addEventListener("click", () => {
      if (confirm("Reboot Codetorch Linux?")) {
        window.location.reload();
      }
    });
  }

  async loadSettings() {
    // Read DE config
    const deConf = await this.ctfs.readFile("/etc/de.conf");
    if (deConf) {
      const deStr = typeof deConf === "string" ? deConf : new TextDecoder().decode(deConf);
      const deSelect = this.container.querySelector("#setting-de");
      if (deSelect) deSelect.value = deStr.trim();
    }

    // Read Remote Server URL
    const savedUrl = localStorage.getItem("ct_storage_server_url");
    if (savedUrl) {
      const urlInput = this.container.querySelector("#setting-remote-url");
      if (urlInput) urlInput.value = savedUrl;
    }

    await this.refreshStorageUsage();
  }

  async refreshStorageUsage() {
    if (typeof navigator === "undefined" || !navigator.storage || !navigator.storage.estimate) return;

    const { usage = 0, quota = 1 } = await navigator.storage.estimate();
    const usedMB = (usage / (1024 * 1024)).toFixed(1);
    const quotaMB = (quota / (1024 * 1024)).toFixed(1);
    const pct = ((usage / quota) * 100).toFixed(1);

    const lblUsed = this.container.querySelector("#lbl-storage-used");
    const lblQuota = this.container.querySelector("#lbl-storage-quota");
    const progressFill = this.container.querySelector("#storage-progress");

    if (lblUsed) lblUsed.textContent = `${usedMB} MB`;
    if (lblQuota) lblQuota.textContent = `${quotaMB} MB`;
    if (progressFill) {
      progressFill.style.width = `${pct}%`;
      progressFill.style.backgroundColor = pct > 85 ? "#ff5555" : "#50fa7b";
    }
  }
}
