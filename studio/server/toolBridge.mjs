import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_BASE = path.resolve(__dirname, "../../artifacts");
const TOOLS_DIR = path.resolve(__dirname, "../../tools/node");
const TOOL_TIMEOUT_MS = 30_000;

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

function spawnTool(tool, artifactPath, input) {
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
    }, TOOL_TIMEOUT_MS);

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
    const { artifactName, input = {} } = body;
    if (!artifactName || typeof artifactName !== "string") {
      sendJSON(res, { ok: false, error: { code: "MISSING_ARTIFACT", message: "artifactName is required" } }, 400);
      return;
    }
    const artifactPath = path.join(ARTIFACTS_BASE, artifactName);
    const result = await spawnTool(tool, artifactPath, input);
    sendJSON(res, result);
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
