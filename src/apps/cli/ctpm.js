/**
 * Codetorch Package Manager Engine (ctpm)
 * Path: /src/apps/cli/ctpm.js
 * License: GNU GPL v3
 */

export async function executeCtpm(args, ctfs, bus) {
  const subcommand = (args[0] || "").toLowerCase();

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    return [
      "\x1b[36mctpm - Codetorch Package Manager\x1b[0m",
      "Usage:",
      "  ctpm install <package>  - Download and install executable package",
      "  ctpm remove <package>   - Uninstall package from hot storage tier",
      "  ctpm list               - Display all installed binary packages",
      "  ctpm search <query>     - Search available remote repositories"
    ].join("\n");
  }

  // 1. Package Installation
  if (subcommand === "install") {
    const pkgName = args[1];
    if (!pkgName) {
      return "\x1b[31m[ctpm] Error: Missing package name. Usage: ctpm install <package>\x1b[0m";
    }

    console.log(`[ctpm] Resolving repository metadata for package: ${pkgName}...`);

    try {
      const targetPath = `/usr/bin/${pkgName}`;
      
      // Simulate package binary payload generation / retrieval
      const encoder = new TextEncoder();
      const binaryPayload = encoder.encode(`#!/usr/bin/env WASI\n# Codetorch Binary: ${pkgName}\nconsole.log("${pkgName} v1.0.0 executed.");`);

      await ctfs.writeFile(targetPath, binaryPayload);

      // Update package database registry
      await updatePackageRegistry(ctfs, pkgName, "add");

      if (bus) {
        bus.emit("terminal:write", `[ctpm] Package '${pkgName}' registered to system path.\n`);
      }

      return [
        `\x1b[32m[ctpm] Package '${pkgName}' successfully installed!\x1b[0m`,
        `Binary link created at: \x1b[33m${targetPath}\x1b[0m`
      ].join("\n");
    } catch (err) {
      return `\x1b[31m[ctpm] Failed to install package '${pkgName}': ${err.message}\x1b[0m`;
    }
  }

  // 2. Package Uninstallation
  if (subcommand === "remove" || subcommand === "uninstall") {
    const pkgName = args[1];
    if (!pkgName) {
      return "\x1b[31m[ctpm] Error: Missing package name. Usage: ctpm remove <package>\x1b[0m";
    }

    const targetPath = `/usr/bin/${pkgName}`;
    const exists = await ctfs.readFile(targetPath);

    if (!exists) {
      return `\x1b[31m[ctpm] Package '${pkgName}' is not installed.\x1b[0m`;
    }

    await ctfs.deleteFile(targetPath);
    await updatePackageRegistry(ctfs, pkgName, "remove");

    return `\x1b[32m[ctpm] Package '${pkgName}' successfully removed.\x1b[0m`;
  }

  // 3. List Installed Packages
  if (subcommand === "list") {
    const registry = await getPackageRegistry(ctfs);
    if (registry.length === 0) {
      return "\x1b[33m[ctpm] No user-installed packages found in hot storage.\x1b[0m";
    }

    const rows = registry.map((pkg) => `  • \x1b[32m${pkg.name}\x1b[0m (v${pkg.version}) - Installed: ${pkg.installedAt}`);
    return [
      "\x1b[36m=== Installed Package Registry ===\x1b[0m",
      ...rows
    ].join("\n");
  }

  // 4. Search Remote Repositories
  if (subcommand === "search") {
    const query = args[1] || "";
    const mockRepo = ["python3", "node", "git", "vim", "curl", "htop", "neofetch", "ffmpeg"];
    const matches = mockRepo.filter((item) => item.includes(query.toLowerCase()));

    if (matches.length === 0) {
      return `\x1b[33m[ctpm] No packages found matching '${query}'.\x1b[0m`;
    }

    return [
      `\x1b[36m=== Repository Search Results ('${query}') ===\x1b[0m`,
      ...matches.map((m) => `  • \x1b[32m${m}\x1b[0m - Official Codetorch WASI Port`)
    ].join("\n");
  }

  return `\x1b[31m[ctpm] Unknown subcommand '${subcommand}'. Run 'ctpm --help' for options.\x1b[0m`;
}

/**
 * Helper to get active package registry state.
 */
async function getPackageRegistry(ctfs) {
  const data = await ctfs.readFile("/var/db/ctpm/registry.json");
  if (!data) return [];
  try {
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    return JSON.parse(text);
  } catch {
    return [];
  }
}

/**
 * Helper to append or remove package entries in registry.
 */
async function updatePackageRegistry(ctfs, pkgName, action) {
  let registry = await getPackageRegistry(ctfs);

  if (action === "add") {
    registry = registry.filter((p) => p.name !== pkgName);
    registry.push({
      name: pkgName,
      version: "1.0.0",
      installedAt: new Date().toISOString().split("T")[0]
    });
  } else if (action === "remove") {
    registry = registry.filter((p) => p.name !== pkgName);
  }

  const encoder = new TextEncoder();
  await ctfs.writeFile("/var/db/ctpm/registry.json", encoder.encode(JSON.stringify(registry, null, 2)));
}
