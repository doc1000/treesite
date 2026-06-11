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
const TOOL_TIMEOUT_MS = 30_000;
const INTAKE_TOOL_TIMEOUT_MS = 90_000;
const INTAKE_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_INTAKE_TOOLS = new Set(["add-pdf", "add-website", "add-html"]);
const NPM_BIN = process.platform === "win32" ? "npm.cmd" : "npm";

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

/** @type {{ artifactProc?: import("node:child_process").ChildProcess, handlerProc?: import("node:child_process").ChildProcess, httpd?: import("node:http").Server, mode?: string, url?: string } | null} */
let activeDeploy = null;

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
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopActiveDeploy() {
  if (!activeDeploy) return;
  const d = activeDeploy;
  activeDeploy = null;
  if (d.httpd) {
    await new Promise((resolve) => d.httpd.close(() => resolve()));
  }
  for (const proc of [d.handlerProc, d.artifactProc]) {
    if (proc && proc.exitCode === null) {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
    }
  }
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

function spawnTool(tool, artifactPath, input, timeoutMs = TOOL_TIMEOUT_MS) {
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
      resolve({ ok: false, error: { code: "TIMEOUT", message: `Tool ${tool} timed out` } });
    }, timeoutMs);

    child.on("close", () => {
      clearTimeout(timer);
      const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length) {
        resolve({ ok: false, error: { code: "NO_OUTPUT", message: `Tool ${tool} produced no stdout. stderr: ${stderr.slice(0, 200)}` } });
        return;
      }
      try {
        resolve(JSON.parse(lines[lines.length - 1]));
      } catch {
        resolve({ ok: false, error: { code: "INVALID_JSON", message: `Tool ${tool} returned non-JSON: ${lines[lines.length - 1].slice(0, 120)}` } });
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

  // ── POST /deploy/stop ───────────────────────────────────────────────────────
  if (req.method === "POST" && pathname === "/deploy/stop") {
    await stopActiveDeploy();
    sendJSON(res, { ok: true });
    return;
  }

  // ── POST /deploy ────────────────────────────────────────────────────────────
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

    await stopActiveDeploy();

    try {
      const artifactPort = await pickFreePort();
      const artifactProc = spawnServeArtifact(artifactPath, artifactPort);
      const artifactBase = `http://127.0.0.1:${artifactPort}/`;
      await waitForUrl(`${artifactBase}artifact.json`, 10_000);

      if (mode === "view") {
        try {
          await fs.promises.access(HANDLER_DIST);
        } catch {
          if (artifactProc.exitCode === null) artifactProc.kill();
          sendJSON(res, {
            ok: false,
            error: {
              code: "HANDLER_NOT_BUILT",
              message: "Run 'npm --prefix handler run build' first.",
            },
          }, 400);
          return;
        }
        const handlerPort = await pickFreePort();
        const httpd = createDistStaticServer(HANDLER_DIST);
        await new Promise((resolve, reject) => {
          httpd.listen(handlerPort, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
        });
        const url = `http://127.0.0.1:${handlerPort}/?artifact=${encodeURIComponent(artifactBase)}`;
        await waitForUrl(`http://127.0.0.1:${handlerPort}/`, 10_000);
        activeDeploy = { artifactProc, httpd, mode: "view", url };
        sendJSON(res, { ok: true, data: { url, mode: "view" } });
        return;
      }

      const handlerPort = await pickFreePort();
      const handlerProc = spawn(NPM_BIN, [
        "run",
        "dev",
        "--",
        "--port",
        String(handlerPort),
        "--strictPort",
      ], {
        cwd: HANDLER_DIR,
        env: { ...process.env, VITE_ARTIFACT_BASE: artifactBase.replace(/\/$/, "") },
        stdio: "ignore",
        shell: process.platform === "win32",
      });
      const url = `http://127.0.0.1:${handlerPort}/`;
      await waitForUrl(url, 60_000);
      activeDeploy = { artifactProc, handlerProc, mode: "edit", url };
      sendJSON(res, { ok: true, data: { url, mode: "edit" } });
    } catch (err) {
      await stopActiveDeploy();
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
    },
  };
}
