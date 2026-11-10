/**
 * Codinal Terminal Application Core
 * Path: /src/apps/ct-term/terminal.js
 * License: GNU GPL v3
 */

import { executeDeTo } from "../cli/DeTo.js";
import { executeHddach } from "../cli/hddach.js";
import { executeCtpm } from "../cli/ctpm.js";

export class CodinalTerminal {
  constructor(containerId, ctfs, bus) {
    this.container = document.getElementById(containerId);
    this.ctfs = ctfs;
    this.bus = bus || (typeof window !== "undefined" ? window.CTBus : null);
    this.history = [];
    this.historyIndex = -1;
    this.currentDirectory = "/home/user";
    
    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    if (!this.container) return;

    this.container.classList.add("codinal-terminal");
    this.container.innerHTML = `
      <div class="terminal-output" id="term-output"></div>
      <div class="terminal-input-line">
        <span class="prompt">${this.getFormattedPrompt()}</span>
        <input type="text" id="term-input" autocomplete="off" spellcheck="false" autofocus />
      </div>
    `;

    this.outputEl = this.container.querySelector("#term-output");
    this.inputEl = this.container.querySelector("#term-input");

    this.writeLine("\x1b[36mCodetorch Linux - Codinal Terminal v1.0.0\x1b[0m");
    this.writeLine("Type '\x1b[33mhelp\x1b[0m' for available built-in commands.\n");
  }

  bindEvents() {
    if (!this.inputEl) return;

    this.inputEl.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        const cmd = this.inputEl.value.trim();
        this.inputEl.value = "";
        if (cmd) {
          this.history.push(cmd);
          this.historyIndex = this.history.length;
          await this.executeCommand(cmd);
        }
      } else if (e.key === "ArrowUp") {
        if (this.historyIndex > 0) {
          this.historyIndex--;
          this.inputEl.value = this.history[this.historyIndex];
        }
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        if (this.historyIndex < this.history.length - 1) {
          this.historyIndex++;
          this.inputEl.value = this.history[this.historyIndex];
        } else {
          this.historyIndex = this.history.length;
          this.inputEl.value = "";
        }
        e.preventDefault();
      }
    });

    // Subscriptions for system IPC broadcasts (quota alerts, daemon outputs)
    if (this.bus) {
      this.bus.on("terminal:write", (text) => this.writeLine(text));
    }

    this.container.addEventListener("click", () => this.inputEl.focus());
  }

  getFormattedPrompt() {
    const displayDir = this.currentDirectory === "/home/user" ? "~" : this.currentDirectory;
    return `user@codetorch:${displayDir}$ `;
  }

  writeLine(text) {
    if (!this.outputEl) return;
    const line = document.createElement("div");
    line.className = "term-line";
    line.innerHTML = this.parseANSI(text);
    this.outputEl.appendChild(line);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }

  async executeCommand(commandStr) {
    this.writeLine(`<span class="prompt">${this.getFormattedPrompt()}</span>${this.escapeHTML(commandStr)}`);

    const parts = commandStr.trim().split(/\s+/);
    const bin = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (bin) {
      case "clear":
        this.outputEl.innerHTML = "";
        break;

      case "help":
        this.writeLine([
          "\x1b[36mBuilt-in System Utilities:\x1b[0m",
          "  • \x1b[32mDeTo\x1b[0m    - Switch between KDE Plasma and GNOME Shell environments",
          "  • \x1b[32mhddach\x1b[0m  - Storage capacity, URL server config, and ZIP exports",
          "  • \x1b[32mctpm\x1b[0m    - Package manager installer & resolver",
          "  • \x1b[32mclear\x1b[0m   - Clear terminal screen",
          "  • \x1b[32mpwd\x1b[0m     - Print working directory",
          "  • \x1b[32mcd\x1b[0m      - Change current directory"
        ].join("\n"));
        break;

      case "pwd":
        this.writeLine(this.currentDirectory);
        break;

      case "cd":
        const target = args[0] || "/home/user";
        this.currentDirectory = target.startsWith("/") ? target : `${this.currentDirectory}/${target}`;
        const promptEl = this.container.querySelector(".prompt");
        if (promptEl) promptEl.textContent = this.getFormattedPrompt();
        break;

      case "deto":
        const detoRes = await executeDeTo(args, this.ctfs, this.bus);
        this.writeLine(detoRes);
        break;

      case "hddach":
        const hddachRes = await executeHddach(args, this.ctfs, this.bus);
        this.writeLine(hddachRes);
        break;

      case "ctpm":
        const ctpmRes = await executeCtpm(args, this.ctfs, this.bus);
        this.writeLine(ctpmRes);
        break;

      default:
        this.writeLine(`\x1b[31mCommand not found: ${bin}\x1b[0m`);
        break;
    }
  }

  parseANSI(input) {
    if (!input) return "";
    let escaped = this.escapeHTML(input);
    escaped = escaped
      .replace(/\x1b\[31;1m/g, '<span style="color: #ff5555; font-weight: bold;">')
      .replace(/\x1b\[31m/g, '<span style="color: #ff5555;">')
      .replace(/\x1b\[32m/g, '<span style="color: #50fa7b;">')
      .replace(/\x1b\[33m/g, '<span style="color: #f1fa8c;">')
      .replace(/\x1b\[34m/g, '<span style="color: #bd93f9;">')
      .replace(/\x1b\[35m/g, '<span style="color: #ff79c6;">')
      .replace(/\x1b\[36m/g, '<span style="color: #8be9fd;">')
      .replace(/\x1b\[37m/g, '<span style="color: #f8f8f2;">')
      .replace(/\x1b\[0m/g, '</span>');
    return escaped.replace(/\n/g, "<br/>");
  }

  escapeHTML(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
