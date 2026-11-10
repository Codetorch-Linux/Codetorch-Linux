/**
 * Codetorch OverlayFS Tiered Union Mount Engine
 * Path: /src/system/storage/ct-overlayfs.js
 * License: GNU GPL v3
 */

export class CTOverlayFS {
  constructor(writeTier, baseImageURL = "/system/base-rootfs") {
    this.writeTier = writeTier;
    this.baseImageURL = baseImageURL;
    this.manifest = null;
  }

  /**
   * Mounts the read-only static rootfs manifest via HTTP.
   */
  async init() {
    try {
      const response = await fetch(`${this.baseImageURL}/manifest.json`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      this.manifest = await response.json();
      console.log("[ct-overlayfs] Remote read-only system image mounted successfully.");
    } catch (err) {
      console.warn("[ct-overlayfs] Failed to load remote manifest, falling back to local-only mode:", err);
      this.manifest = { files: {} };
    }
  }

  /**
   * Reads a file, checking the local Hot Tier first before falling back to HTTP Range requests.
   */
  async readFile(filePath) {
    // 1. Check local Read-Write Hot Tier (IndexedDB / OPFS)
    const localFile = await this.writeTier.readFile(filePath);
    if (localFile !== null && localFile !== undefined) {
      return localFile;
    }

    // 2. Fall back to Read-Only Base Image Manifest via HTTP Byte Range Request
    if (this.manifest && this.manifest.files && this.manifest.files[filePath]) {
      const node = this.manifest.files[filePath];
      const startByte = node.offset;
      const endByte = node.offset + node.size - 1;

      const response = await fetch(`${this.baseImageURL}/rootfs.bin`, {
        headers: { Range: `bytes=${startByte}-${endByte}` }
      });

      if (!response.ok && response.status !== 206) {
        throw new Error(`[ct-overlayfs] Range request failed for ${filePath}: HTTP ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    }

    return null;
  }

  /**
   * Writes modifications strictly to the local Read-Write Hot Tier.
   */
  async writeFile(filePath, content) {
    await this.writeTier.writeFile(filePath, content);
  }

  /**
   * Deletes a node from the local hot tier.
   */
  async deleteFile(filePath) {
    await this.writeTier.deleteFile(filePath);
  }

  /**
   * Checks whether a file node exists across either tier.
   */
  async exists(filePath) {
    const localFile = await this.writeTier.readFile(filePath);
    if (localFile !== null && localFile !== undefined) return true;
    return !!(this.manifest && this.manifest.files && this.manifest.files[filePath]);
  }
}
