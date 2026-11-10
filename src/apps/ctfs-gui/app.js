/**
 * Codetorch Visual File Manager (ctfs-gui)
 * Path: /src/apps/ctfs-gui/app.js
 * License: GNU GPL v3
 */

export class CTFSFileManager {
  constructor(containerId, ctfs, overlayfs, bus) {
    this.container = document.getElementById(containerId);
    this.ctfs = ctfs;
    this.overlayfs = overlayfs;
    this.bus = bus || (typeof window !== "undefined" ? window.CTBus : null);

    this.currentPath = "/home/user";
    this.initDOM();
    this.bindEvents();
    this.loadDirectory(this.currentPath);
  }

  initDOM() {
    if (!this.container) return;

    this.container.classList.add("ctfs-file-manager");
    this.container.innerHTML = `
      <div class="ctfs-toolbar">
        <button id="ctfs-btn-up" title="Up One Directory">⬆ Up</button>
        <button id="ctfs-btn-refresh" title="Refresh Directory">🔄 Refresh</button>
        <input type="text" id="ctfs-path-bar" value="${this.currentPath}" />
        <button id="ctfs-btn-new-file">+ File</button>
        <button id="ctfs-btn-new-folder">+ Folder</button>
      </div>
      <div class="ctfs-body">
        <div class="ctfs-sidebar">
          <div class="shortcut-item" data-path="/home/user">📁 Home</div>
          <div class="shortcut-item" data-path="/usr/bin">⚙️ Binaries</div>
          <div class="shortcut-item" data-path="/etc">🛠️ System Config</div>
          <div class="shortcut-item" data-path="/var/db/ctpm">📦 Packages</div>
        </div>
        <div class="ctfs-grid" id="ctfs-grid"></div>
      </div>
      <div class="ctfs-statusbar" id="ctfs-statusbar">Ready</div>
    `;

    this.gridEl = this.container.querySelector("#ctfs-grid");
    this.pathBar = this.container.querySelector("#ctfs-path-bar");
    this.statusEl = this.container.querySelector("#ctfs-statusbar");
  }

  bindEvents() {
    if (!this.container) return;

    // Navigation Controls
    this.container.querySelector("#ctfs-btn-up").addEventListener("click", () => {
      const parts = this.currentPath.split("/").filter(Boolean);
      parts.pop();
      this.loadDirectory("/" + parts.join("/"));
    });

    this.container.querySelector("#ctfs-btn-refresh").addEventListener("click", () => {
      this.loadDirectory(this.currentPath);
    });

    this.pathBar.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.loadDirectory(this.pathBar.value.trim());
      }
    });

    // File/Folder Creation
    this.container.querySelector("#ctfs-btn-new-file").addEventListener("click", () => this.promptCreateFile());
    this.container.querySelector("#ctfs-btn-new-folder").addEventListener("click", () => this.promptCreateFolder());

    // Sidebar Shortcuts
    const shortcuts = this.container.querySelectorAll(".shortcut-item");
    shortcuts.forEach((sc) => {
      sc.addEventListener("click", () => {
        const targetPath = sc.getAttribute("data-path");
        if (targetPath) this.loadDirectory(targetPath);
      });
    });

    // IPC Event Listeners
    if (this.bus) {
      this.bus.on("fs:change", () => this.loadDirectory(this.currentPath));
    }
  }

  /**
   * Reads combined entries from local Hot Tier (ctfs) and Base Image Overlay (ct-overlayfs)
   */
  async loadDirectory(path) {
    this.currentPath = path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    if (this.pathBar) this.pathBar.value = this.currentPath;
    this.gridEl.innerHTML = "<div class='loading-spinner'>Loading directory...</div>";

    try {
      const items = await this.getDirectoryContents(this.currentPath);
      this.renderGrid(items);
      this.updateStatus(`${items.length} item(s)`);
    } catch (err) {
      console.error(`[ctfs-gui] Failed to load directory ${this.currentPath}:`, err);
      this.gridEl.innerHTML = `<div class="error-msg">Error reading path: ${err.message}</div>`;
      this.updateStatus("Failed to read path.");
    }
  }

  async getDirectoryContents(path) {
    const entriesMap = new Map();

    // 1. Fetch entries from Overlay FS Manifest
    if (this.overlayfs && this.overlayfs.manifest && this.overlayfs.manifest.files) {
      const prefix = path === "/" ? "/" : path + "/";
      Object.keys(this.overlayfs.manifest.files).forEach((filePath) => {
        if (filePath.startsWith(prefix)) {
          const subPath = filePath.slice(prefix.length);
          const name = subPath.split("/")[0];
          const isDir = subPath.includes("/");
          if (name && !entriesMap.has(name)) {
            entriesMap.set(name, {
              name,
              path: prefix + name,
              isDirectory: isDir,
              tier: "overlay-ro",
              size: isDir ? "-" : (this.overlayfs.manifest.files[filePath].size || 0)
            });
          }
        }
      });
    }

    // 2. Fetch local user nodes from Hot Storage (ctfs)
    if (this.ctfs && this.ctfs.db) {
      const localFiles = await new Promise((resolve) => {
        const tx = this.ctfs.db.transaction("files", "readonly");
        const store = tx.objectStore("files");
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });

      const prefix = path === "/" ? "/" : path + "/";
      localFiles.forEach((f) => {
        if (f.path.startsWith(prefix)) {
          const subPath = f.path.slice(prefix.length);
          const name = subPath.split("/")[0];
          const isDir = f.isDirectory || subPath.includes("/");
          if (name) {
            entriesMap.set(name, {
              name,
              path: prefix + name,
              isDirectory: isDir,
              tier: "indexeddb-rw",
              size: isDir ? "-" : (f.content ? f.content.length : 0),
              updatedAt: f.updatedAt
            });
          }
        }
      });
    }

    return Array.from(entriesMap.values()).sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  renderGrid(items) {
    this.gridEl.innerHTML = "";

    if (items.length === 0) {
      this.gridEl.innerHTML = "<div class='empty-folder'>Folder is empty</div>";
      return;
    }

    items.forEach((item) => {
      const node = document.createElement("div");
      node.className = `grid-node ${item.isDirectory ? "folder" : "file"}`;
      node.innerHTML = `
        <div class="node-icon">${item.isDirectory ? "📁" : "📄"}</div>
        <div class="node-name" title="${item.name}">${item.name}</div>
        <div class="node-tier ${item.tier}">${item.tier === "overlay-ro" ? "RO" : "RW"}</div>
      `;

      node.addEventListener("dblclick", () => {
        if (item.isDirectory) {
          this.loadDirectory(item.path);
        } else {
          this.openFile(item);
        }
      });

      // Context menu simulation
      node.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.showContextMenu(e.clientX, e.clientY, item);
      });

      this.gridEl.appendChild(node);
    });
  }

  async openFile(item) {
    const content = await this.overlayfs.readFile(item.path);
    let text = "";
    if (content instanceof Uint8Array) {
      text = new TextDecoder().decode(content);
    } else if (typeof content === "string") {
      text = content;
    } else {
      text = "[Binary Data]";
    }

    alert(`Viewing File: ${item.path}\n-------------------------\n${text.slice(0, 1000)}`);
  }

  async promptCreateFile() {
    const filename = prompt("Enter new file name:");
    if (!filename) return;

    const fullPath = `${this.currentPath === "/" ? "" : this.currentPath}/${filename}`;
    const encoder = new TextEncoder();
    await this.ctfs.writeFile(fullPath, encoder.encode(""));
    
    if (this.bus) this.bus.emit("fs:change", { path: fullPath });
    await this.loadDirectory(this.currentPath);
  }

  async promptCreateFolder() {
    const folderName = prompt("Enter new folder name:");
    if (!folderName) return;

    const fullPath = `${this.currentPath === "/" ? "" : this.currentPath}/${folderName}`;
    await this.ctfs.writeFile(`${fullPath}/.keep`, new Uint8Array(0));
    
    if (this.bus) this.bus.emit("fs:change", { path: fullPath });
    await this.loadDirectory(this.currentPath);
  }

  async deleteItem(item) {
    if (item.tier === "overlay-ro") {
      alert("Cannot delete read-only files from base OS image.");
      return;
    }

    if (confirm(`Delete '${item.name}'?`)) {
      await this.ctfs.deleteFile(item.path);
      if (this.bus) this.bus.emit("fs:change", { path: item.path });
      await this.loadDirectory(this.currentPath);
    }
  }

  showContextMenu(x, y, item) {
    const existing = document.getElementById("ctfs-context-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.id = "ctfs-context-menu";
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    menu.innerHTML = `
      <div class="menu-item" id="ctx-open">Open</div>
      ${item.tier !== "overlay-ro" ? '<div class="menu-item danger" id="ctx-delete">Delete</div>' : ""}
    `;

    document.body.appendChild(menu);

    menu.querySelector("#ctx-open").addEventListener("click", () => {
      menu.remove();
      if (item.isDirectory) this.loadDirectory(item.path);
      else this.openFile(item);
    });

    const btnDelete = menu.querySelector("#ctx-delete");
    if (btnDelete) {
      btnDelete.addEventListener("click", () => {
        menu.remove();
        this.deleteItem(item);
      });
    }

    const closeHandler = () => {
      menu.remove();
      window.removeEventListener("click", closeHandler);
    };
    setTimeout(() => window.addEventListener("click", closeHandler), 50);
  }

  updateStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }
}
