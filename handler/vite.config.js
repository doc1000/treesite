import path from "node:path";
import { fileURLToPath } from "node:url";
import { createReadStream, existsSync, statSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const exampleArtifactDir = path.resolve(appRoot, "../artifacts/example");

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

function serveExampleArtifactPlugin() {
  return {
    name: "serve-example-artifact",
    configureServer(server) {
      server.middlewares.use("/artifact", (req, res, next) => {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        const rel = urlPath.replace(/^\/+/, "") || "artifact.json";
        const filePath = path.normalize(path.join(exampleArtifactDir, rel));
        const rootNorm = path.normalize(exampleArtifactDir);
        if (!filePath.startsWith(rootNorm)) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }
        if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
          next();
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
        createReadStream(filePath).pipe(res);
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.TREESITE_HANDLER_BASE || "/",
  plugins: [react(), serveExampleArtifactPlugin()],
  resolve: {
    alias: {
      "treesite-map": path.resolve(appRoot, "../shared/treesite-map/index.jsx"),
    },
  },
  envPrefix: "VITE_",
  server: {
    port: 5174
  }
});
