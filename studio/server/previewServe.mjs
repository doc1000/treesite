import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { artifactDirForName, HANDLER_DIST } from "./previewPaths.mjs";

const STATIC_MIME = {
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

function sendFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader("Content-Type", STATIC_MIME[ext] || "application/octet-stream");
  createReadStream(filePath).pipe(res);
}

function serveHandlerPreview(rootDir) {
  const root = path.resolve(rootDir);
  return (req, res, next) => {
    const raw = req.url || "/";
    if (!raw.startsWith("/preview")) return next();

    const urlPath = decodeURIComponent(raw.split("?")[0]);
    let sub = urlPath.slice("/preview".length) || "/";
    if (!sub.startsWith("/")) sub = `/${sub}`;
    const rel = sub.replace(/^\/+/, "") || "index.html";
    let filePath = path.normalize(path.join(root, rel));

    if (!filePath.startsWith(root)) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      const indexPath = path.join(root, "index.html");
      if (existsSync(indexPath)) {
        sendFile(indexPath, res);
        return;
      }
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    sendFile(filePath, res);
  };
}

function serveNamedArtifacts() {
  return (req, res, next) => {
    const raw = req.url || "/";
    if (!raw.startsWith("/artifact/")) return next();

    const urlPath = decodeURIComponent(raw.split("?")[0]);
    const afterMount = urlPath.slice("/artifact/".length);
    const slash = afterMount.indexOf("/");
    const artifactName = decodeURIComponent(
      slash >= 0 ? afterMount.slice(0, slash) : afterMount,
    );
    const rel = slash >= 0 ? afterMount.slice(slash + 1) : "";
    const relFile = rel.replace(/^\/+/, "") || "artifact.json";

    const artifactDir = artifactDirForName(artifactName);
    if (!artifactDir) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    const filePath = path.normalize(path.join(artifactDir, relFile));
    const rootNorm = path.normalize(artifactDir);
    if (!filePath.startsWith(rootNorm + path.sep) && filePath !== rootNorm) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    sendFile(filePath, res);
  };
}

export default function previewServePlugin() {
  return {
    name: "preview-serve",
    configureServer(server) {
      server.middlewares.use(serveHandlerPreview(HANDLER_DIST));
      server.middlewares.use(serveNamedArtifacts());
    },
  };
}
