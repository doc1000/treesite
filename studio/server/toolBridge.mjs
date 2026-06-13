import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const ARTIFACTS_BASE = path.resolve(REPO_ROOT, "artifacts");
const TOOLS_DIR = path.resolve(REPO_ROOT, "tools/node");
const HANDLER_DIR = path.resolve(REPO_ROOT, "handler");
const HANDLER_DIST = path.join(HANDLER_DIR, "dist");
const SERVE_ARTIFACT_SCRIPT = path.join(TOOLS_DIR, "serve-artifact.js");
const TOOL_TIMEOUT_MS = 60_000;
const INTAKE_TOOL_TIMEOUT_MS = 120_000;
const INTAKE_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_INTAKE_TOOLS = new Set(["add-pdf", "add-website", "add-html"]);
/** Fixed port for handler Vite dev — matches handler/vite.config.js server.port */
const HANDLER_DEV_PORT = 5174;
/** Fixed port for static handler/dist preview in view mode */
const HANDLER_VIEW_PORT = 5180;

/** @type {Promise<{ port: number, proc: import("node:child_process").ChildProcess | null, adopted: boolean }> | null} */
let handlerDevStartPromise = null;

const STATIC_MIME = {
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * Three independent long-lived server handles.
 *
 * artifactServer  – serves the selected artifact's JSON/asset files.
 *                   Replaced only when the artifact name changes.
 * handlerDevServer – `npm run dev` for the handler (Vite HMR).
 *                   Started once per session; NEVER killed on mode switch.
 * viewServer      – plain Node http.Server serving handler/dist.
 *                   Started once; reused for every view-mode deploy.
 */

/** @type {{ proc: import("node:child_process").ChildProcess, port: number, artifactName: string, artifactBase: string } | null} */
let artifactServer = null;

/** @type {{ proc: import("node:child_process").ChildProcess | null, port: number, adopted?: boolean } | null} */
let handlerDevServer = null;

/** @type {{ httpd: import("node:http").Server, port: number } | null} */
let viewServer = null;

function pickFreePort() {
  return new Promise((res) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
}

async function waitForUrl(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUrlReachable(url, 2000)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function isUrlReachable(url, timeoutMs = 1500) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

function handlerDevBaseUrl(port = HANDLER_DEV_PORT) {
  return `http://127.0.0.1:${port}/`;
}

async function isHandlerDevReachable(port = HANDLER_DEV_PORT) {
  return isUrlReachable(handlerDevBaseUrl(port), 2000);
}

function killProc(proc) {
  if (proc && proc.exitCode === null) {
    try { proc.kill(); } catch { /* ignore */ }
  }
}

/** Ensure the artifact file server is up for the given artifact.
 *  Restarts only when the artifact name changes. */
async function ensureArtifactServer(artifactName, artifactPath) {
  if (
    artifactServer?.artifactName === artifactName &&
    (await isUrlReachable(`${artifactServer.artifactBase}artifact.json`, 2000))
  ) {
    return artifactServer;
  }
  // Kill the old one if running
  if (artifactServer) killProc(artifactServer.proc);

  const port = await pickFreePort();
  const proc = spawnServeArtifact(artifactPath, port);
  const artifactBase = `http://127.0.0.1:${port}/`;
  await waitForUrl(`${artifactBase}artifact.json`, 10_000);
  artifactServer = { proc, port, artifactName, artifactBase };
  return artifactServer;
}

/** Ensure handler/dist static server is up.
 *  Started once per session; kept alive across mode switches. */
async function ensureViewServer() {
  if (viewServer?.httpd?.listening) return viewServer;
  if (await isUrlReachable(`http://127.0.0.1:${HANDLER_VIEW_PORT}/`, 1500)) {
    viewServer = { httpd: null, port: HANDLER_VIEW_PORT, adopted: true };
    return viewServer;
  }
  try {
    await fs.promises.access(HANDLER_DIST);
  } catch {
    throw Object.assign(
      new Error("Run 'npm --prefix handler run build' first."),
      { code: "HANDLER_NOT_BUILT" },
    );
  }
  const port = HANDLER_VIEW_PORT;
  const httpd = createDistStaticServer(HANDLER_DIST);
  try {
    await new Promise((resolve, reject) => {
      httpd.listen(port, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
    });
    viewServer = { httpd, port, adopted: false };
    return viewServer;
  } catch (err) {
    if (err?.code === "EADDRINUSE" && (await isUrlReachable(`http://127.0.0.1:${port}/`, 1500))) {
      viewServer = { httpd: null, port, adopted: true };
      return viewServer;
    }
    throw err;
  }
}

function resolveHandlerViteBin() {
  const candidates = [
    path.join(HANDLER_DIR, "node_modules", "vite", "bin", "vite.js"),
    path.join(HANDLER_DIR, "node_modules", "vite", "bin", "vite.mjs"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    "handler Vite not installed. Run: npm --prefix handler install",
  );
}

function spawnHandlerDevProcess(port) {
  const viteBin = resolveHandlerViteBin();
  const proc = spawn(
    process.execPath,
    [viteBin, "--port", String(port), "--strictPort"],
    {
      cwd: HANDLER_DIR,
      env: { ...process.env },
      stdio: "ignore",
      detached: true,
      windowsHide: true,
    },
  );
  proc.unref();
  return proc;
}

/** Ensure the handler Vite dev server is up on HANDLER_DEV_PORT.
 *  Reuses any process already listening (HTTP probe). Single-flight start. */
async function ensureHandlerDevServer() {
  if (await isHandlerDevReachable()) {
    if (!handlerDevServer) {
      handlerDevServer = { port: HANDLER_DEV_PORT, proc: null, adopted: true };
    }
    return handlerDevServer;
  }

  if (handlerDevStartPromise) return handlerDevStartPromise;

  handlerDevStartPromise = (async () => {
    if (await isHandlerDevReachable()) {
      handlerDevServer = { port: HANDLER_DEV_PORT, proc: null, adopted: true };
      return handlerDevServer;
    }

    if (handlerDevServer?.proc && !handlerDevServer.adopted) {
      killProc(handlerDevServer.proc);
    }

    const port = HANDLER_DEV_PORT;
    const proc = spawnHandlerDevProcess(port);
    await waitForUrl(handlerDevBaseUrl(port), 90_000);
    handlerDevServer = { proc, port, adopted: false };
    return handlerDevServer;
  })().finally(() => {
    handlerDevStartPromise = null;
  });

  return handlerDevStartPromise;
}

/** Start handler dev in the background when the studio Vite server boots. */
function warmHandlerDevServer() {
  return ensureHandlerDevServer();
}

/** Stop everything. Called only by POST /deploy/stop. */
async function stopAllServers() {
  killProc(artifactServer?.proc);
  artifactServer = null;

  if (handlerDevServer?.proc && !handlerDevServer.adopted) {
    killProc(handlerDevServer.proc);
  }
  handlerDevServer = null;
  handlerDevStartPromise = null;

  if (viewServer?.httpd && !viewServer.adopted) {
    await new Promise((resolve) => viewServer.httpd.close(() => resolve()));
  }
  viewServer = null;
}

function spawnServeArtifact(artifactPath, port) {
  return spawn(process.execPath, [
    SERVE_ARTIFACT_SCRIPT,
    "--dir",
    artifactPath,
    "--port",
    String(port),
  ], { stdio: "ignore" });
}

function createDistStaticServer(distDir) {
  const root = path.resolve(distDir);
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const rel = urlPath.replace(/^\/+/, "") || "index.html";
    let filePath = path.normalize(path.join(root, rel));
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      const indexPath = path.join(root, "index.html");
      if (existsSync(indexPath)) filePath = indexPath;
      else {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", STATIC_MIME[ext] || "application/octet-stream");
    createReadStream(filePath).pipe(res);
  });
}

/** Parse ALL parts of a multipart/form-data request.
 * Returns { fields: Record<string,string>, fileData: Buffer|null, fileName: string|null }
 * The binary file part must use field name "file".
 */
async function parseMultipartAll(req, maxSizeBytes = INTAKE_MAX_BYTES) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/i);
  if (!boundaryMatch) throw new Error("Expected multipart/form-data");
  const boundary = boundaryMatch[1] || boundaryMatch[2];

  let totalSize = 0;
  const chunks = [];
  for await (const chunk of req) {
    totalSize += chunk.length;
    if (totalSize > maxSizeBytes) {
      throw new Error(`Upload exceeds ${Math.round(maxSizeBytes / 1024 / 1024)} MB limit`);
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);

  const fields = {};
  let fileData = null;
  let fileName = null;

  const delim = Buffer.from(`--${boundary}`);
  let pos = body.indexOf(delim);
  if (pos < 0) throw new Error("Invalid multipart body");
  pos += delim.length;
  if (body[pos] === 0x0d && body[pos + 1] === 0x0a) pos += 2;

  while (pos < body.length) {
    const next = body.indexOf(delim, pos);
    const partEnd = next > 0 ? next : body.length;
    const part = body.subarray(pos, partEnd);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd < 0) break;

    const headerStr = part.subarray(0, headerEnd).toString("utf8");
    let data = part.subarray(headerEnd + 4);
    if (data.length >= 2 && data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a) {
      data = data.subarray(0, data.length - 2);
    }

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]*)"/);

    if (nameMatch) {
      const fieldName = nameMatch[1];
      if (filenameMatch && fieldName === "file") {
        fileData = data;
        fileName = filenameMatch[1] || "upload.bin";
      } else if (!filenameMatch) {
        fields[fieldName] = data.toString("utf8");
      }
    }

    if (next < 0) break;
    pos = next + delim.length;
    if (body.subarray(pos, pos + 2).toString() === "--") break;
    if (body[pos] === 0x0d && body[pos + 1] === 0x0a) pos += 2;
  }

  return { fields, fileData, fileName };
}

async function parseMultipartFile(req) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/i);
  if (!boundaryMatch) throw new Error("Expected multipart/form-data");
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const delim = Buffer.from(`--${boundary}`);
  let start = body.indexOf(delim);
  if (start < 0) throw new Error("Invalid multipart body");
  start += delim.length;
  if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2;

  while (start < body.length) {
    const next = body.indexOf(delim, start);
    const part = body.subarray(start, next > 0 ? next : body.length);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd < 0) break;
    const headers = part.subarray(0, headerEnd).toString("utf8");
    const data = part.subarray(headerEnd + 4);
    const trimmed = data[data.length - 1] === 0x0a && data[data.length - 2] === 0x0d
      ? data.subarray(0, data.length - 2)
      : data;
    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]*)"/);
    if (nameMatch?.[1] === "file" && filenameMatch) {
      const originalName = filenameMatch[1] || "upload.bin";
      const dir = path.join(os.tmpdir(), randomUUID());
      await fs.promises.mkdir(dir, { recursive: true });
      const tempPath = path.join(dir, path.basename(originalName));
      await fs.promises.writeFile(tempPath, trimmed);
      return { tempPath, originalName };
    }
    if (next < 0) break;
    start = next + delim.length;
    if (body.subarray(start, start + 2).toString() === "--") break;
    if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2;
  }
  throw new Error('No "file" field in multipart body');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch (e) {
        reject(new Error(`Invalid JSON body: ${e.message}`));
      }
    });
    req.on("error", reject);
  });
}

// Concurrency limiter: cap simultaneous tool spawns so that a long-running
// deploy/export does not starve quick ribbon-button tools.
const MAX_CONCURRENT_TOOLS = 3;
let _activeTools = 0;
const _toolQueue = [];

function _acquireTool() {
  return new Promise((resolve) => {
    if (_activeTools < MAX_CONCURRENT_TOOLS) {
      _activeTools++;
      resolve();
    } else {
      _toolQueue.push(resolve);
    }
  });
}

function _releaseTool() {
  if (_toolQueue.length > 0) {
    _toolQueue.shift()();
  } else {
    _activeTools--;
  }
}

async function spawnTool(tool, artifactPath, input, timeoutMs = TOOL_TIMEOUT_MS) {
  await _acquireTool();
  try {
    return await _spawnToolInner(tool, artifactPath, input, timeoutMs);
  } finally {
    _releaseTool();
  }
}

function _spawnToolInner(tool, artifactPath, input, timeoutMs) {
  return new Promise((resolve) => {
    const script = path.join(TOOLS_DIR, `${tool}.js`);
    let child;
    try {
      child = spawn(process.execPath, [script, "--artifact", artifactPath], {
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      return resolve({ ok: false, error: { code: "SPAWN_ERROR", message: err.message } });
    }

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    try {
      child.stdin.write(JSON.stringify(input));
      child.stdin.end();
    } catch (err) {
      resolve({ ok: false, error: { code: "STDIN_ERROR", message: err.message } });
      return;
    }

    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      resolve({ ok: false, error: { code: "TIMEOUT", message: `Tool ${tool} timed out after ${timeoutMs}ms. stderr: ${stderr.slice(0, 2048)}` } });
    }, timeoutMs);

    child.on("close", () => {
      clearTimeout(timer);
      const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length) {
        resolve({ ok: false, error: { code: "NO_OUTPUT", message: `Tool ${tool} produced no stdout. stderr: ${stderr.slice(0, 4096)}` } });
        return;
      }
      try {
        resolve(JSON.parse(lines[lines.length - 1]));
      } catch {
        resolve({ ok: false, error: { code: "INVALID_JSON", message: `Tool ${tool} returned non-JSON: ${lines[lines.length - 1].slice(0, 400)}. stderr: ${stderr.slice(0, 2048)}` } });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: { code: "SPAWN_ERROR", message: err.message } });
    });
  });
}

async function walkDir(dir, relDir, entries) {
  let items;
  try {
    items = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const item of items) {
    if (item.name === "node_modules") continue;
    const relPath = relDir ? `${relDir}/${item.name}` : item.name;
    entries.push({ path: relPath, type: item.isDirectory() ? "dir" : "file" });
    if (item.isDirectory()) {
      await walkDir(path.join(dir, item.name), relPath, entries);
    }
  }
}

function sendJSON(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

async function handler(req, res, next) {
  const pathname = (req.url || "/").split("?")[0];

  // ── GET /artifacts ─────────────────────────────────────────────────────────
  if (req.method === "GET" && pathname === "/artifacts") {
    try {
      const dirEntries = await fs.promises.readdir(ARTIFACTS_BASE, { withFileTypes: true });
      const results = [];
      for (const entry of dirEntries) {
        if (!entry.isDirectory()) continue;
        const artifactJsonPath = path.join(ARTIFACTS_BASE, entry.name, "artifact.json");
        try {
          await fs.promises.access(artifactJsonPath);
        } catch {
          continue;
        }
        let displayName = entry.name;
        let schemaVersion = null;
        try {
          const meta = JSON.parse(await fs.promises.readFile(artifactJsonPath, "utf8"));
          displayName = meta.displayName || entry.name;
          schemaVersion = meta.schemaVersion ?? null;
        } catch { /* use defaults */ }

        let itemCount = 0;
        const statsResult = await spawnTool(
          "artifact-stats",
          path.join(ARTIFACTS_BASE, entry.name),
          {},
        );
        if (statsResult.ok && statsResult.data) {
          itemCount = statsResult.data.itemCount ?? 0;
          if (schemaVersion === null) schemaVersion = statsResult.data.schemaVersion ?? null;
        }
        results.push({ name: entry.name, displayName, schemaVersion, itemCount });
      }
      sendJSON(res, results);
    } catch (err) {
      sendJSON(res, { error: String(err) }, 500);
    }
    return;
  }

  // ── GET /artifacts/:name/export ─────────────────────────────────────────────
  const exportMatch = pathname.match(/^\/artifacts\/([^/]+)\/export$/);
  if (req.method === "GET" && exportMatch) {
    const name = decodeURIComponent(exportMatch[1]);
    const artifactPath = path.join(ARTIFACTS_BASE, name);
    const destZip = path.join(os.tmpdir(), `treesite-export-${randomUUID()}.zip`);
    try {
      const result = await spawnTool("export-zip", artifactPath, { destZip });
      if (!result.ok) {
        sendJSON(res, result, 400);
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${name}.zip"`,
      );
      const stream = createReadStream(destZip);
      stream.pipe(res);
      stream.on("end", () => {
        fs.promises.unlink(destZip).catch(() => {});
      });
      stream.on("error", () => {
        fs.promises.unlink(destZip).catch(() => {});
      });
    } catch (err) {
      sendJSON(res, { ok: false, error: { code: "EXPORT_FAILED", message: String(err) } }, 500);
    }
    return;
  }

  // ── GET /artifacts/:name/items ─────────────────────────────────────────────
  // Returns raw items including hidden ones (manifest omits them). Used by the
  // studio to show the Hidden group in the nav and as href-target candidates.
  const itemsMatch = pathname.match(/^\/artifacts\/([^/]+)\/items$/);
  if (req.method === "GET" && itemsMatch) {
    const name = decodeURIComponent(itemsMatch[1]);
    const itemsDir = path.join(ARTIFACTS_BASE, name, "items");
    try {
      const entries = await fs.promises.readdir(itemsDir, { withFileTypes: true });
      const items = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        try {
          const raw = JSON.parse(
            await fs.promises.readFile(path.join(itemsDir, entry.name), "utf8")
          );
          // Surface a minimal shape: no large embedded html/pdf blobs
          items.push({
            id: raw.id,
            slug: raw.slug || path.basename(entry.name, ".json"),
            name: raw.name,
            section: raw.section,
            type: raw.type,
            hidden: raw.hidden ?? false,
          });
        } catch { /* skip malformed item */ }
      }
      sendJSON(res, items);
    } catch {
      sendJSON(res, []);
    }
    return;
  }

  // ── GET /artifacts/:name/files ──────────────────────────────────────────────
  const filesMatch = pathname.match(/^\/artifacts\/([^/]+)\/files$/);
  if (req.method === "GET" && filesMatch) {
    const name = decodeURIComponent(filesMatch[1]);
    const artifactPath = path.join(ARTIFACTS_BASE, name);
    try {
      const entries = [];
      await walkDir(artifactPath, "", entries);
      sendJSON(res, entries);
    } catch (err) {
      sendJSON(res, { error: String(err) }, 500);
    }
    return;
  }

  // ── POST /tool/:tool ────────────────────────────────────────────────────────
  const toolMatch = pathname.match(/^\/tool\/([^/]+)$/);
  if (req.method === "POST" && toolMatch) {
    const tool = decodeURIComponent(toolMatch[1]);
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      sendJSON(res, { ok: false, error: { code: "BAD_REQUEST", message: err.message } }, 400);
      return;
    }
    let artifactPath;
    let toolInput = body.input ?? {};
    if (tool === "import-zip") {
      const destDir = body.destDir ?? body.artifactName;
      if (!destDir || typeof destDir !== "string") {
        sendJSON(res, { ok: false, error: { code: "MISSING_DEST", message: "destDir or artifactName is required for import-zip" } }, 400);
        return;
      }
      artifactPath = path.isAbsolute(destDir)
        ? destDir
        : path.join(ARTIFACTS_BASE, destDir);
      toolInput = {
        srcZip: toolInput.srcZip ?? body.srcZip,
        overwrite: toolInput.overwrite ?? body.overwrite ?? false,
      };
      if (!toolInput.srcZip) {
        sendJSON(res, { ok: false, error: { code: "MISSING_SRC", message: "srcZip is required" } }, 400);
        return;
      }
    } else {
      const { artifactName } = body;
      if (!artifactName || typeof artifactName !== "string") {
        sendJSON(res, { ok: false, error: { code: "MISSING_ARTIFACT", message: "artifactName is required" } }, 400);
        return;
      }
      artifactPath = path.join(ARTIFACTS_BASE, artifactName);
    }
    const result = await spawnTool(tool, artifactPath, toolInput);
    sendJSON(res, result);
    return;
  }

  // ── GET /artifacts/:name/static/** ─────────────────────────────────────────
  // Serves artifact asset files (previews, pdfs, html, …) directly from the
  // bridge so the studio can display thumbnails without a running deploy.
  const staticMatch = pathname.match(/^\/artifacts\/([^/]+)\/static\/(.+)$/);
  if (req.method === "GET" && staticMatch) {
    const artifactName = decodeURIComponent(staticMatch[1]);
    const relPath = staticMatch[2]; // e.g. "assets/previews/foo.png"
    const artifactDir = path.join(ARTIFACTS_BASE, artifactName);
    // Prevent path traversal
    const target = path.normalize(path.join(artifactDir, relPath));
    if (!target.startsWith(artifactDir + path.sep) && target !== artifactDir) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    try {
      await fs.promises.access(target);
      const ext = path.extname(target).toLowerCase();
      res.setHeader("Content-Type", STATIC_MIME[ext] || "application/octet-stream");
      createReadStream(target).pipe(res);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
    return;
  }

  // ── POST /intake/:tool ──────────────────────────────────────────────────────
  // Accepts multipart/form-data: fields[artifactName, fields(JSON)], file (binary).
  // Stages file to temp dir, injects sourcePath, calls the tool, cleans up.
  const intakeMatch = pathname.match(/^\/intake\/([^/]+)$/);
  if (req.method === "POST" && intakeMatch) {
    const tool = decodeURIComponent(intakeMatch[1]);
    if (!ALLOWED_INTAKE_TOOLS.has(tool)) {
      sendJSON(res, { ok: false, error: { code: "INVALID_TOOL", message: `${tool} is not an intake tool` } }, 400);
      return;
    }

    let parsed;
    try {
      parsed = await parseMultipartAll(req);
    } catch (err) {
      sendJSON(res, { ok: false, error: { code: "UPLOAD_FAILED", message: err.message } }, 400);
      return;
    }

    const { fields, fileData, fileName } = parsed;
    const artifactName = fields.artifactName;
    if (!artifactName || typeof artifactName !== "string") {
      sendJSON(res, { ok: false, error: { code: "MISSING_ARTIFACT", message: "artifactName is required" } }, 400);
      return;
    }

    let toolInput = {};
    if (fields.fields) {
      try {
        toolInput = JSON.parse(fields.fields);
      } catch {
        sendJSON(res, { ok: false, error: { code: "BAD_REQUEST", message: "fields must be valid JSON" } }, 400);
        return;
      }
    }

    // Validate file type if a file was provided
    if (fileData && fileName) {
      const ext = path.extname(fileName).toLowerCase();
      if (tool === "add-pdf" && ext !== ".pdf") {
        sendJSON(res, { ok: false, error: { code: "INVALID_FILE", message: "Only .pdf files are accepted for add-pdf" } }, 400);
        return;
      }
      if (tool === "add-html" && ext !== ".html" && ext !== ".htm") {
        sendJSON(res, { ok: false, error: { code: "INVALID_FILE", message: "Only .html/.htm files are accepted for add-html" } }, 400);
        return;
      }
    }

    const artifactPath = path.join(ARTIFACTS_BASE, artifactName);
    let tempDir = null;

    try {
      if (fileData && fileName) {
        tempDir = path.join(os.tmpdir(), randomUUID());
        await fs.promises.mkdir(tempDir, { recursive: true });
        const tempFilePath = path.join(tempDir, path.basename(fileName));
        await fs.promises.writeFile(tempFilePath, fileData);
        toolInput = { ...toolInput, sourcePath: tempFilePath };
      }
      const result = await spawnTool(tool, artifactPath, toolInput, INTAKE_TOOL_TIMEOUT_MS);
      sendJSON(res, result);
    } catch (err) {
      sendJSON(res, { ok: false, error: { code: "INTAKE_FAILED", message: err.message } }, 500);
    } finally {
      if (tempDir) {
        fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
    return;
  }

  // ── POST /upload ────────────────────────────────────────────────────────────
  if (req.method === "POST" && pathname === "/upload") {
    try {
      const { tempPath } = await parseMultipartFile(req);
      sendJSON(res, { ok: true, data: { tempPath } });
    } catch (err) {
      sendJSON(res, { ok: false, error: { code: "UPLOAD_FAILED", message: err.message } }, 400);
    }
    return;
  }

  // ── GET /deploy/status ──────────────────────────────────────────────────────
  // Returns which servers are currently running so the UI can show state.
  if (req.method === "GET" && pathname === "/deploy/status") {
    const handlerAlive = await isHandlerDevReachable();
    const viewAlive =
      (viewServer?.httpd?.listening ?? false)
      || (await isUrlReachable(`http://127.0.0.1:${HANDLER_VIEW_PORT}/`, 1500));
    sendJSON(res, {
      ok: true,
      data: {
        artifactServer: artifactServer
          ? {
              artifactName: artifactServer.artifactName,
              port: artifactServer.port,
              alive: await isUrlReachable(`${artifactServer.artifactBase}artifact.json`, 2000),
            }
          : null,
        handlerDevServer: {
          port: HANDLER_DEV_PORT,
          alive: handlerAlive,
          warming: handlerDevStartPromise != null,
        },
        viewServer: viewAlive
          ? { port: viewServer?.port ?? HANDLER_VIEW_PORT, alive: true }
          : null,
      },
    });
    return;
  }

  // ── POST /reveal ────────────────────────────────────────────────────────────
  // Opens the artifact folder (or the artifacts base) in the OS file browser.
  if (req.method === "POST" && pathname === "/reveal") {
    let body = {};
    try { body = await readBody(req); } catch { /* ignore */ }
    const name = typeof body.artifactName === "string" ? body.artifactName.trim() : "";
    const targetDir = name
      ? path.join(ARTIFACTS_BASE, name)
      : ARTIFACTS_BASE;
    try {
      if (process.platform === "win32") {
        spawn("explorer", [targetDir], { shell: false, detached: true, stdio: "ignore" });
      } else if (process.platform === "darwin") {
        spawn("open", [targetDir], { detached: true, stdio: "ignore" });
      } else {
        spawn("xdg-open", [targetDir], { detached: true, stdio: "ignore" });
      }
      sendJSON(res, { ok: true });
    } catch (err) {
      sendJSON(res, { ok: false, error: { code: "REVEAL_FAILED", message: err.message } }, 500);
    }
    return;
  }

  // ── POST /deploy/stop ───────────────────────────────────────────────────────
  if (req.method === "POST" && pathname === "/deploy/stop") {
    await stopAllServers();
    sendJSON(res, { ok: true });
    return;
  }

  // ── POST /deploy ────────────────────────────────────────────────────────────
  // Mode switches (view ↔ edit) never restart the handler Vite dev server.
  // The artifact server restarts only when the selected artifact changes.
  // Both view and edit pass the artifact URL as ?artifact= so the handler
  // instance can be reused across mode/artifact changes without env restarts.
  if (req.method === "POST" && pathname === "/deploy") {
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      sendJSON(res, { ok: false, error: { code: "BAD_REQUEST", message: err.message } }, 400);
      return;
    }
    const { artifactName, mode } = body;
    if (!artifactName || (mode !== "view" && mode !== "edit")) {
      sendJSON(res, {
        ok: false,
        error: { code: "BAD_REQUEST", message: "artifactName and mode (view|edit) are required" },
      }, 400);
      return;
    }
    const artifactPath = path.join(ARTIFACTS_BASE, artifactName);
    try {
      await fs.promises.access(path.join(artifactPath, "artifact.json"));
    } catch {
      sendJSON(res, { ok: false, error: { code: "NOT_FOUND", message: `Artifact not found: ${artifactName}` } }, 404);
      return;
    }

    try {
      // Step 1: artifact file server (restarts only on artifact change)
      const as = await ensureArtifactServer(artifactName, artifactPath);

      if (mode === "view") {
        // Step 2v: static handler/dist server (started once, reused)
        let vs;
        try {
          vs = await ensureViewServer();
        } catch (err) {
          sendJSON(res, {
            ok: false,
            error: { code: err.code || "HANDLER_NOT_BUILT", message: err.message },
          }, 400);
          return;
        }
        const url = `http://127.0.0.1:${vs.port}/?artifact=${encodeURIComponent(as.artifactBase)}`;
        sendJSON(res, { ok: true, data: { url, mode: "view", reused: true } });
        return;
      }

      // Step 2e: handler Vite dev server (started once, never killed on mode switch)
      const wasWarm = await isHandlerDevReachable();
      const hds = await ensureHandlerDevServer();
      const url = `http://127.0.0.1:${hds.port}/?artifact=${encodeURIComponent(as.artifactBase)}`;
      sendJSON(res, {
        ok: true,
        data: { url, mode: "edit", reused: wasWarm },
      });
    } catch (err) {
      sendJSON(res, { ok: false, error: { code: "DEPLOY_FAILED", message: err.message } }, 500);
    }
    return;
  }

  next();
}

export default function toolBridgePlugin() {
  return {
    name: "tool-bridge",
    configureServer(server) {
      server.middlewares.use("/api", handler);
      void warmHandlerDevServer().catch((err) => {
        console.warn("[tool-bridge] handler dev warm-up:", err.message);
      });
    },
  };
}
