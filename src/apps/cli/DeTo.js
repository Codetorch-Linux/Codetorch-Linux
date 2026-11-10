/**
 * Codetorch Desktop Switcher Utility (DeTo)
 * Path: /src/apps/cli/DeTo.js
 * License: GNU GPL v3
 */

export async function executeDeTo(args, ctfs, bus) {
  const command = (args[0] || "").toLowerCase();

  if (!command || command === "--help" || command === "-h") {
    return [
      "\x1b[36mDeTo - Codetorch Desktop Environment Switcher\x1b[0m",
      "Usage:",
      "  DeTo gnome      - Switch target session to GNOME Shell",
      "  DeTo plasma     - Switch target session to KDE Plasma",
      "  DeTo status     - Show active session configuration",
      "  DeTo reboot     - Restart Codetorch Linux to apply changes"
    ].join("\n");
  }

  if (command === "status") {
    const rawData = await ctfs.readFile("/etc/de.conf");
    let activeDE = "plasma";
    if (rawData) {
      activeDE = typeof rawData === "string" ? rawData : new TextDecoder().decode(rawData);
    }
    return `[DeTo] Active desktop configuration: \x1b[32m${activeDE.trim().toUpperCase()}\x1b[0m`;
  }

  if (command === "reboot") {
    if (bus) {
      bus.emit("system:reboot", {});
    }
    setTimeout(() => {
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    }, 300);
    return "\x1b[33m[DeTo] System reboot initiated...\x1b[0m";
  }

  if (command === "gnome" || command === "plasma") {
    const encoder = new TextEncoder();
    await ctfs.writeFile("/etc/de.conf", encoder.encode(command));
    
    return [
      `\x1b[32m[DeTo] Desktop environment target set to ${command.toUpperCase()}.\x1b[0m`,
      "Run '\x1b[36mDeTo reboot\x1b[0m' to switch the WASI runtime."
    ].join("\n");
  }

  return `\x1b[31m[DeTo] Unknown target '${command}'. Run 'DeTo --help' for options.\x1b[0m`;
}
