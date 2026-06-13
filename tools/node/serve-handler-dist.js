/**
 * Static file server for handler/dist (view-only preview).
 * Ports: typically 5180 (HANDLER_VIEW_PORT in studio/server/toolBridge.mjs).
 *
 * Usage: node serve-handler-dist.js --dist <handler-dist-dir> [--port 5180]
 */
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createReadStream, existsSync, statSync } from "node:fs";

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

export function createDistStaticServer(distDir) {
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

function parseArgs(argv = process.argv.slice(2)) {
  const args = { port: "5180", dist: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dist") {
      args.dist = argv[++i];
    } else if (arg === "--port") {
      args.port = argv[++i];
    }
  }
  if (!args.dist) {
    console.error("Usage: node serve-handler-dist.js --dist <handler-dist-dir> [--port 5180]");
    process.exit(1);
  }
  return args;
}

const scriptPath = fileURLToPath(import.meta.url);
const isCli = process.argv[1] && path.resolve(process.argv[1]) === scriptPath;

if (isCli) {
  const { dist, port } = parseArgs();
  const rootDir = path.resolve(dist);
  if (!existsSync(rootDir)) {
    console.error(`Handler dist not found: ${rootDir}`);
    process.exit(1);
  }
  const server = createDistStaticServer(rootDir);
  server.listen(Number(port), "127.0.0.1", () => {
    console.log(`Serving handler dist ${rootDir} at http://127.0.0.1:${port}/`);
  });
}
