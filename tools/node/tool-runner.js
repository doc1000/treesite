import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { applyContentItems } from "../../handler/src/contentItems.js";
import { ErrorCodes } from "./error-codes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_SCHEMAS = path.join(__dirname, "..", "..", "schemas");

export const KNOWN_SCHEMA_VERSION = 1;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ITEM_TYPE_ENUM = [
  "text",
  "link",
  "href",
  "contact",
  "pdf",
  "website",
  "htmlCard",
  "section"
];

/** Read piped stdin without blocking interactive shells that leave stdin open. */
async function readStdinOptional() {
  if (process.stdin.isTTY) {
    return "";
  }

  const chunks = [];
  return await new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer);
      process.stdin.removeAllListeners("data");
      process.stdin.removeAllListeners("end");
      process.stdin.pause();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };

    const timer = setTimeout(finish, 50);

    process.stdin.on("data", chunk => chunks.push(chunk));
    process.stdin.on("end", finish);
    process.stdin.resume();
  });
}

/**
 * @param {string[]} [argv]
 * @returns {Promise<{ artifactPath: string, input: Record<string, unknown>, flags: Set<string> }>}
 */
export async function parseToolArgs(argv = process.argv.slice(2)) {
  const flags = new Set();
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      fail(1, ErrorCodes.INVALID_INPUT, `Unexpected argument: ${arg}`);
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey.trim();
    if (!key) {
      fail(1, ErrorCodes.INVALID_INPUT, `Invalid argument: ${arg}`);
    }

    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      if (["human", "text", "check", "card-index"].includes(key)) {
        flags.add(key === "text" ? "human" : key);
      } else {
        args[key] = true;
      }
      continue;
    }

    args[key] = next;
    i += 1;
  }

  const artifactRaw = args.artifact;
  if (typeof artifactRaw !== "string" || !artifactRaw.trim()) {
    fail(1, ErrorCodes.INVALID_INPUT, "Missing required --artifact <path>.");
  }

  let input = {};
  if (typeof args.input === "string" && args.input.trim()) {
    try {
      input = JSON.parse(args.input);
    } catch (err) {
      fail(1, ErrorCodes.INVALID_INPUT, "Invalid JSON in --input.", { parseError: String(err) });
    }
  } else {
    const stdin = (await readStdinOptional()).trim();
    if (stdin) {
      try {
        input = JSON.parse(stdin);
      } catch (err) {
        fail(1, ErrorCodes.INVALID_INPUT, "Invalid JSON on stdin.", { parseError: String(err) });
      }
    }
  }

  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    fail(1, ErrorCodes.INVALID_INPUT, "Tool input must be a JSON object.");
  }

  return {
    artifactPath: path.resolve(artifactRaw.trim()),
    input: /** @type {Record<string, unknown>} */ (input),
    flags
  };
}

export function success(data) {
  process.stdout.write(`${JSON.stringify({ ok: true, data })}\n`);
  process.exit(0);
}

/**
 * @param {number} exitCode
 * @param {string} errorCode
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 */
export function fail(exitCode, errorCode, message, details = {}) {
  const payload = {
    ok: false,
    error: {
      code: errorCode,
      message,
      details
    }
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.stderr.write(`${errorCode}: ${message}\n`);
  process.exit(exitCode);
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function loadArtifact(artifactPath) {
  if (!(await pathExists(artifactPath))) {
    fail(2, ErrorCodes.ARTIFACT_NOT_FOUND, `Artifact path not found: ${artifactPath}`);
  }

  const metaPath = path.join(artifactPath, "artifact.json");
  if (!(await pathExists(metaPath))) {
    fail(2, ErrorCodes.ARTIFACT_MALFORMED, "Missing artifact.json in artifact root.");
  }

  let meta;
  try {
    meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
  } catch (err) {
    fail(2, ErrorCodes.ARTIFACT_MALFORMED, "artifact.json is not valid JSON.", {
      cause: String(err)
    });
  }

  for (const field of ["name", "displayName", "tagline", "defaultSchemeId"]) {
    if (typeof meta[field] !== "string" || !meta[field].trim()) {
      fail(2, ErrorCodes.ARTIFACT_MALFORMED, `artifact.json missing required field "${field}".`);
    }
  }

  if (typeof meta.schemaVersion !== "number" || !Number.isInteger(meta.schemaVersion)) {
    fail(2, ErrorCodes.ARTIFACT_MALFORMED, "artifact.json schemaVersion must be an integer.");
  }

  if (meta.schemaVersion > KNOWN_SCHEMA_VERSION) {
    fail(2, ErrorCodes.SCHEMA_VERSION_UNKNOWN, `Unknown schemaVersion ${meta.schemaVersion}.`, {
      schemaVersion: meta.schemaVersion,
      knownVersion: KNOWN_SCHEMA_VERSION
    });
  }

  if (meta.schemaVersion < KNOWN_SCHEMA_VERSION) {
    process.stderr.write(
      `Warning: artifact schemaVersion ${meta.schemaVersion} is below current ${KNOWN_SCHEMA_VERSION}; run migrate.\n`
    );
  }

  return meta;
}

export function itemSchemaErrors(item, filename = "item") {
  const errors = [];
  for (const field of ["id", "name", "slug", "section", "type"]) {
    if (typeof item[field] !== "string" || !item[field].trim()) {
      errors.push(`${filename}: missing or empty "${field}"`);
    }
  }

  if (item.id && !UUID_RE.test(item.id)) {
    errors.push(`${filename}: id must be a UUID`);
  }

  if (item.type && !ITEM_TYPE_ENUM.includes(item.type)) {
    errors.push(`${filename}: unsupported type "${item.type}"`);
  }

  return errors;
}

export function validateItemSchema(item, filename = "item") {
  const errors = itemSchemaErrors(item, filename);
  if (errors.length) {
    fail(2, ErrorCodes.ARTIFACT_MALFORMED, "Item failed schema validation.", { errors });
  }
}

export async function loadItems(artifactPath) {
  const itemsDir = path.join(artifactPath, "items");
  if (!(await pathExists(itemsDir))) {
    fail(2, ErrorCodes.ARTIFACT_MALFORMED, "Missing items/ directory in artifact.");
  }

  const entries = await fs.readdir(itemsDir, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const itemPath = path.join(itemsDir, entry.name);
    let item;
    try {
      item = JSON.parse(await fs.readFile(itemPath, "utf8"));
    } catch (err) {
      fail(2, ErrorCodes.ARTIFACT_MALFORMED, `Invalid JSON in items/${entry.name}.`, {
        cause: String(err)
      });
    }
    item.slug ||= path.basename(entry.name, ".json");
    validateItemSchema(item, entry.name);
    items.push(item);
  }

  return items.sort((a, b) => {
    const sectionOrder = a.section.localeCompare(b.section);
    if (sectionOrder !== 0) return sectionOrder;
    return a.name.localeCompare(b.name);
  });
}

export function itemFilePath(artifactPath, slug) {
  return path.join(artifactPath, "items", `${slug}.json`);
}

export async function writeItem(artifactPath, item) {
  const slug = item.slug;
  if (typeof slug !== "string" || !slug.trim()) {
    fail(1, ErrorCodes.INVALID_INPUT, "Item must include a non-empty slug to write.");
  }

  const next = { ...item };
  if (!next.id) {
    next.id = randomUUID();
  }
  validateItemSchema(next, `${slug}.json`);

  const target = itemFilePath(artifactPath, slug);
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `${JSON.stringify(next, null, 2)}\n`);
  } catch (err) {
    fail(4, ErrorCodes.FILESYSTEM_ERROR, `Failed to write item ${slug}.`, { cause: String(err) });
  }

  return next;
}

export async function deleteItem(artifactPath, slug) {
  const target = itemFilePath(artifactPath, slug);
  try {
    await fs.unlink(target);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      fail(3, ErrorCodes.ITEM_NOT_FOUND, `No item file for slug "${slug}".`);
    }
    fail(4, ErrorCodes.FILESYSTEM_ERROR, `Failed to delete item ${slug}.`, { cause: String(err) });
  }
}

export function buildSiteRootFromArtifact(meta) {
  return {
    name: "Home",
    displayName: meta.displayName,
    description: meta.tagline,
    children: []
  };
}

export async function loadManifest(artifactPath) {
  const manifestPath = path.join(artifactPath, "manifest.json");
  if (!(await pathExists(manifestPath))) {
    fail(2, ErrorCodes.ARTIFACT_MALFORMED, "Missing manifest.json in artifact.");
  }
  try {
    return JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch (err) {
    fail(2, ErrorCodes.ARTIFACT_MALFORMED, "manifest.json is not valid JSON.", {
      cause: String(err)
    });
  }
}

export async function rebuildManifest(artifactPath) {
  const meta = await loadArtifact(artifactPath);
  const items = await loadItems(artifactPath);
  const siteRoot = buildSiteRootFromArtifact(meta);
  const manifest = applyContentItems(siteRoot, items);
  const manifestPath = path.join(artifactPath, "manifest.json");
  try {
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (err) {
    fail(4, ErrorCodes.FILESYSTEM_ERROR, "Failed to write manifest.json.", { cause: String(err) });
  }
  return { manifest, itemCount: items.length };
}

export function findItemById(items, id) {
  return items.find(item => item.id === id) ?? null;
}

export async function resolveItemTarget(items, input) {
  if (typeof input.id === "string" && input.id.trim()) {
    const item = findItemById(items, input.id.trim());
    if (!item) {
      fail(3, ErrorCodes.ITEM_NOT_FOUND, `No item with id '${input.id}' found in artifact.`);
    }
    return item;
  }

  if (typeof input.slug === "string" && input.slug.trim()) {
    const slug = input.slug.trim();
    const item = items.find(i => i.slug === slug);
    if (!item) {
      fail(3, ErrorCodes.ITEM_NOT_FOUND, `No item with slug '${slug}' found in artifact.`);
    }
    process.stderr.write(
      "Deprecation: targeting by slug is supported for convenience; use id as the primary key.\n"
    );
    return item;
  }

  fail(1, ErrorCodes.INVALID_INPUT, "Input must include id (preferred) or slug.");
}

export function schemaPath(name) {
  return path.join(REPO_SCHEMAS, name);
}
