import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";

const EXCLUDE_NAMES = new Set([".gitkeep", ".DS_Store"]);
const INCLUDE_TOP = new Set([
  "artifact.json",
  "manifest.json",
  "items",
  "assets",
  "schemes",
  "migrations"
]);

/** Fixed DOS date/time for reproducible archives (1980-01-01 00:00:00). */
const FIXED_DOS_TIME = 0x0000;
const FIXED_DOS_DATE = 0x0021;

function shouldExcludeEntry(name) {
  if (EXCLUDE_NAMES.has(name)) return true;
  if (name.endsWith(".DS_Store")) return true;
  if (name.startsWith(".") && name !== ".gitkeep") return true;
  return false;
}

async function collectArtifactFiles(artifactRoot) {
  const files = [];

  async function walk(relativeDir) {
    const absDir = path.join(artifactRoot, relativeDir);
    const entries = await fs.readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      if (shouldExcludeEntry(entry.name)) continue;
      const rel = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const relPosix = rel.split(path.sep).join("/");
      if (entry.isDirectory()) {
        await walk(rel);
      } else if (entry.isFile()) {
        files.push(relPosix);
      }
    }
  }

  for (const name of INCLUDE_TOP) {
    const abs = path.join(artifactRoot, name);
    try {
      const stat = await fs.stat(abs);
      if (stat.isDirectory()) {
        await walk(name);
      } else if (stat.isFile() && !shouldExcludeEntry(name)) {
        files.push(name);
      }
    } catch {
      // optional dirs may be missing except core files checked elsewhere
    }
  }

  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return ~crc >>> 0;
}

function writeUInt32LE(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

function writeUInt16LE(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n & 0xffff, 0);
  return b;
}

/**
 * Build a deterministic ZIP (deflated, fixed timestamps, sorted entries).
 * @param {string} artifactRoot
 * @returns {Promise<Buffer>}
 */
export async function createArtifactZipBuffer(artifactRoot) {
  const relativePaths = await collectArtifactFiles(artifactRoot);
  const parts = [];
  const central = [];
  let offset = 0;

  for (const relPath of relativePaths) {
    const absPath = path.join(artifactRoot, ...relPath.split("/"));
    const data = await fs.readFile(absPath);
    const compressed = deflateRawSync(data, { level: 9 });
    const nameBuf = Buffer.from(relPath, "utf8");
    const crc = crc32(data);

    const localHeader = Buffer.concat([
      writeUInt32LE(0x04034b50),
      writeUInt16LE(20),
      writeUInt16LE(0x0800),
      writeUInt16LE(8),
      writeUInt16LE(FIXED_DOS_TIME),
      writeUInt16LE(FIXED_DOS_DATE),
      writeUInt32LE(crc),
      writeUInt32LE(compressed.length),
      writeUInt32LE(data.length),
      writeUInt16LE(nameBuf.length),
      writeUInt16LE(0),
      nameBuf,
      compressed
    ]);

    parts.push(localHeader);

    const centralHeader = Buffer.concat([
      writeUInt32LE(0x02014b50),
      writeUInt16LE(20),
      writeUInt16LE(20),
      writeUInt16LE(0x0800),
      writeUInt16LE(8),
      writeUInt16LE(FIXED_DOS_TIME),
      writeUInt16LE(FIXED_DOS_DATE),
      writeUInt32LE(crc),
      writeUInt32LE(compressed.length),
      writeUInt32LE(data.length),
      writeUInt16LE(nameBuf.length),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt32LE(0),
      writeUInt32LE(offset),
      nameBuf
    ]);
    central.push(centralHeader);
    offset += localHeader.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.concat([
    writeUInt32LE(0x06054b50),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt16LE(relativePaths.length),
    writeUInt16LE(relativePaths.length),
    writeUInt32LE(centralBuf.length),
    writeUInt32LE(offset),
    writeUInt16LE(0)
  ]);

  return Buffer.concat([...parts, centralBuf, end]);
}

export async function writeArtifactZip(artifactRoot, destZip) {
  const buf = await createArtifactZipBuffer(artifactRoot);
  await fs.mkdir(path.dirname(destZip), { recursive: true });
  await fs.writeFile(destZip, buf);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  return { sizeBytes: buf.length, sha256 };
}

function findEndOfCentralDirectory(buf) {
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      return i;
    }
  }
  return -1;
}

function inflateEntry(compressed, method, uncompressedSize) {
  if (method === 0) {
    return compressed.subarray(0, uncompressedSize);
  }
  if (method === 8) {
    return inflateRawSync(compressed);
  }
  throw new Error(`Unsupported zip compression method ${method}`);
}

/**
 * Extract zip buffer to destDir (creates directory).
 * @param {string} srcZip
 * @param {string} destDir
 */
export async function extractZipToDirectory(srcZip, destDir) {
  const buf = await fs.readFile(srcZip);
  const eocdOffset = findEndOfCentralDirectory(buf);
  if (eocdOffset < 0) {
    throw new Error("Invalid zip: end of central directory not found.");
  }

  const entryCount = buf.readUInt16LE(eocdOffset + 10);
  const centralOffset = buf.readUInt32LE(eocdOffset + 16);
  await fs.mkdir(destDir, { recursive: true });

  let ptr = centralOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) {
      throw new Error("Invalid zip central directory.");
    }
    const compression = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const uncompressedSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localHeaderOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    ptr += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue;
    if (name.includes("..") || path.isAbsolute(name)) {
      throw new Error(`Unsafe zip entry path: ${name}`);
    }

    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compressed = buf.subarray(dataStart, dataStart + compressedSize);
    const data = inflateEntry(compressed, compression, uncompressedSize);

    const outPath = path.join(destDir, ...name.split("/"));
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, data);
  }
}
