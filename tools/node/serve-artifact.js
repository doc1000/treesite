import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createReadStream, existsSync, statSync } from "node:fs";

const MIME = {
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
  ".pdf": "application/pdf"
};

function parseArgs(argv = process.argv.slice(2)) {
  const args = { port: "5199", dir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dir") {
      args.dir = argv[++i];
    } else if (arg === "--port") {
      args.port = argv[++i];
    }
  }
  if (!args.dir) {
    console.error("Usage: node serve-artifact.js --dir <artifact-path> [--port 5199]");
    process.exit(1);
  }
  return args;
}

function sendFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  res.setHeader("Access-Control-Allow-Origin", "*");
  createReadStream(filePath).pipe(res);
}

const { dir, port } = parseArgs();
const rootDir = path.resolve(dir);

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const rel = urlPath.replace(/^\/+/, "") || "artifact.json";
  const filePath = path.normalize(path.join(rootDir, rel));

  if (!filePath.startsWith(path.normalize(rootDir))) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  sendFile(filePath, res);
});

server.listen(Number(port), () => {
  console.log(`Serving artifact ${rootDir} at http://localhost:${port}/`);
});
