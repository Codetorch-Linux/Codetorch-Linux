/**
 * Codetorch Storage & Mount Utility (hddach)
 * Path: /src/apps/cli/hddach.js
 * License: GNU GPL v3
 */

export async function executeHddach(args, ctfs, bus) {
  const subcommand = (args[0] || "").toLowerCase();

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    return [
      "\x1b[36mhddach - Codetorch Storage & Backup Manager\x1b[0m",
      "Usage:",
      "  hddach status            - Show IndexedDB & OPFS storage capacity and active remote server",
      "  hddach server <url>      - Persist remote storage server URL across browser data wipes",
      "  hddach server disconnect - Remove persistent remote storage server URL",
      "  hddach save              - Pack hot-tier storage and export as ZIP download to host",
      "  hddach indexdb wipe      - Purge local IndexedDB hot storage cache"
    ].join("\n");
  }

  // 1. Storage Status Check
  if (subcommand === "status") {
    const remoteUrl = localStorage.getItem("ct_storage_server_url") || "None (Local Only)";
    let usageStr = "Unknown";
    let quotaStr = "Unknown";
    let percentageStr = "0.0%";

    if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
      const { usage = 0, quota = 1 } = await navigator.storage.estimate();
      usageStr = `${(usage / (1024 * 1024)).toFixed(1)} MB`;
      quotaStr = `${(quota / (1024 * 1024)).toFixed(1)} MB`;
      percentageStr = `${((usage / quota) * 100).toFixed(1)}%`;
    }

    return [
      "\x1b[36m=== Codetorch Storage Status ===\x1b[0m",
      `IndexedDB Usage:      \x1b[33m${usageStr}\x1b[0m / \x1b[32m${quotaStr}\x1b[0m (${percentageStr})`,
      `Remote Storage Server: \x1b[35m${remoteUrl}\x1b[0m`
    ].join("\n");
  }

  // 2. Remote Server Storage URL Configuration
  if (subcommand === "server") {
    const targetUrl = args[1];

    if (!targetUrl) {
      return "\x1b[31m[hddach] Missing URL argument. Usage: hddach server <url|disconnect>\x1b[0m";
    }

    if (targetUrl.toLowerCase() === "disconnect") {
      localStorage.removeItem("ct_storage_server_url");
      return "\x1b[32m[hddach] Remote storage server configuration removed.\x1b[0m";
    }

    try {
      new URL(targetUrl); // Validate URL format
      localStorage.setItem("ct_storage_server_url", targetUrl);
      return [
        `\x1b[32m[hddach] Remote storage server URL saved: ${targetUrl}\x1b[0m`,
        "\x1b[37mThis URL will persist across browser storage wipes and re-connect on next boot.\x1b[0m"
      ].join("\n");
    } catch (err) {
      return `\x1b[31m[hddach] Invalid URL format: ${targetUrl}\x1b[0m`;
    }
  }

  // 3. Export Storage to Host ZIP Archive
  if (subcommand === "save") {
    try {
      console.log("[hddach] Gathering files from hot storage tier...");
      const files = await getAllFilesFromDB(ctfs);
      
      const zipBlob = await createZipArchive(files);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `codetorch-backup-${timestamp}.zip`;

      triggerHostDownload(zipBlob, filename);

      return [
        `\x1b[32m[hddach] Backup archive successfully generated: ${filename}\x1b[0m`,
        `\x1b[37mExported ${files.length} file node(s) to host Downloads directory.\x1b[0m`
      ].join("\n");
    } catch (err) {
      return `\x1b[31m[hddach] Failed to export storage backup: ${err.message}\x1b[0m`;
    }
  }

  // 4. Wipe Local Hot Tier Cache
  if (subcommand === "indexdb" && (args[1] || "").toLowerCase() === "wipe") {
    try {
      const indexedDB = window.indexedDB || self.indexedDB;
      if (indexedDB) {
        indexedDB.deleteDatabase("CodetorchFS");
      }
      return [
        "\x1b[31;1m[hddach] IndexedDB hot tier storage database has been wiped.\x1b[0m",
        "\x1b[33mReloading system in 2 seconds to launch initial storage setup...\x1b[0m"
      ].join("\n");
    } finally {
      setTimeout(() => {
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      }, 2000);
    }
  }

  return `\x1b[31m[hddach] Unknown command '${subcommand}'. Run 'hddach --help' for available commands.\x1b[0m`;
}

/**
 * Reads all file objects from IndexedDB 'files' store.
 */
function getAllFilesFromDB(ctfs) {
  return new Promise((resolve, reject) => {
    if (!ctfs.db) return reject(new Error("Database connection uninitialized."));

    const tx = ctfs.db.transaction("files", "readonly");
    const store = tx.objectStore("files");
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Constructs a Store-mode uncompressed ZIP binary archive blob.
 */
async function createZipArchive(files) {
  const encoder = new TextEncoder();
  const fileEntries = [];
  let centralDirectorySize = 0;
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path.replace(/^\//, ""));
    let dataBytes;

    if (file.content instanceof Uint8Array) {
      dataBytes = file.content;
    } else if (typeof file.content === "string") {
      dataBytes = encoder.encode(file.content);
    } else {
      dataBytes = new Uint8Array(0);
    }

    const crc = calculateCRC32(dataBytes);

    // Local Header
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, 0x04034b50, true); // Local header signature
    view.setUint16(4, 20, true);         // Version needed
    view.setUint16(6, 0, true);          // General flag
    view.setUint16(8, 0, true);          // Compression (0 = Store)
    view.setUint16(10, 0, true);         // Time
    view.setUint16(12, 0, true);         // Date
    view.setUint32(14, crc, true);       // CRC32
    view.setUint32(18, dataBytes.length, true); // Compressed size
    view.setUint32(22, dataBytes.length, true); // Uncompressed size
    view.setUint16(26, nameBytes.length, true); // Filename length
    view.setUint16(28, 0, true);         // Extra field length
    localHeader.set(nameBytes, 30);

    fileEntries.push({
      nameBytes,
      dataBytes,
      localHeader,
      crc,
      offset,
      size: dataBytes.length
    });

    offset += localHeader.length + dataBytes.length;
  }

  const cdHeaders = [];
  let cdOffset = 0;

  for (const entry of fileEntries) {
    const cdHeader = new Uint8Array(46 + entry.nameBytes.length);
    const view = new DataView(cdHeader.buffer);
    view.setUint32(0, 0x02014b50, true); // Central directory signature
    view.setUint16(4, 20, true);         // Version made by
    view.setUint16(6, 20, true);         // Version needed
    view.setUint16(8, 0, true);          // General flag
    view.setUint16(10, 0, true);         // Compression
    view.setUint16(12, 0, true);         // Time
    view.setUint16(14, 0, true);         // Date
    view.setUint32(16, entry.crc, true); // CRC32
    view.setUint32(20, entry.size, true);// Compressed size
    view.setUint32(24, entry.size, true);// Uncompressed size
    view.setUint16(28, entry.nameBytes.length, true); // Name length
    view.setUint16(30, 0, true);         // Extra length
    view.setUint16(32, 0, true);         // Comment length
    view.setUint16(34, 0, true);         // Disk start
    view.setUint16(36, 0, true);         // Internal attrs
    view.setUint32(38, 0, true);         // External attrs
    view.setUint32(42, entry.offset, true); // Local header offset
    cdHeader.set(entry.nameBytes, 46);

    cdHeaders.push(cdHeader);
    cdOffset += cdHeader.length;
  }

  // End of Central Directory Record
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
  eocdView.setUint16(4, 0, true);          // Disk number
  eocdView.setUint16(6, 0, true);          // Start disk
  eocdView.setUint16(8, fileEntries.length, true); // Entries on disk
  eocdView.setUint16(10, fileEntries.length, true); // Total entries
  eocdView.setUint32(12, cdOffset, true);  // Central directory size
  eocdView.setUint32(16, offset, true);    // Offset of CD
  eocdView.setUint16(20, 0, true);         // Comment length

  // Combine into single Uint8Array / Blob
  const blobParts = [];
  for (const entry of fileEntries) {
    blobParts.push(entry.localHeader);
    blobParts.push(entry.dataBytes);
  }
  for (const cdHeader of cdHeaders) {
    blobParts.push(cdHeader);
  }
  blobParts.push(eocd);

  return new Blob(blobParts, { type: "application/zip" });
}

/**
 * Triggers host browser file download modal.
 */
function triggerHostDownload(blob, filename) {
  if (typeof document === "undefined") return;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

/**
 * Standard CRC32 calculation table for ZIP format encoding.
 */
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function calculateCRC32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}
