import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

function send(response, statusCode, body, contentType) {
  response.writeHead(statusCode, { "content-type": contentType });
  response.end(body);
}

async function readIfAllowed(filePath, root) {
  const resolved = path.resolve(filePath);
  const resolvedRoot = path.resolve(root);
  if (!resolved.startsWith(resolvedRoot)) {
    throw new Error(`Refusing to serve file outside ${resolvedRoot}.`);
  }

  return fs.readFile(resolved);
}

function renderPage() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      html, body {
        margin: 0;
        background: transparent;
      }

      canvas {
        display: block;
      }
    </style>
  </head>
  <body>
    <canvas id="preview"></canvas>
    <script type="module">
      import * as pdfjsLib from "/pdfjs/build/pdf.mjs";

      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/build/pdf.worker.mjs";

      const data = await fetch("/document.pdf").then(response => response.arrayBuffer());
      const pdf = await pdfjsLib.getDocument({ data }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.getElementById("preview");
      const context = canvas.getContext("2d");

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      await page.render({ canvasContext: context, viewport }).promise;
      canvas.dataset.ready = "true";
    </script>
  </body>
</html>`;
}

async function createPreviewServer({ pdfPath, appRoot }) {
  const pdfjsRoot = path.join(appRoot, "node_modules", "pdfjs-dist");

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");

      if (url.pathname === "/") {
        send(response, 200, renderPage(), "text/html; charset=utf-8");
        return;
      }

      if (url.pathname === "/document.pdf") {
        send(response, 200, await fs.readFile(pdfPath), "application/pdf");
        return;
      }

      if (url.pathname.startsWith("/pdfjs/")) {
        const relativePath = url.pathname.replace(/^\/pdfjs\//, "");
        const filePath = path.join(pdfjsRoot, relativePath);
        send(response, 200, await readIfAllowed(filePath, pdfjsRoot), "text/javascript");
        return;
      }

      send(response, 404, "Not found", "text/plain; charset=utf-8");
    } catch (error) {
      send(response, 500, error.message || String(error), "text/plain; charset=utf-8");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise(resolve => server.close(resolve))
  };
}

export async function renderPdfPreview({ pdfPath, outputPath, appRoot }) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const server = await createPreviewServer({ pdfPath, appRoot });
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 1600 },
      deviceScaleFactor: 1
    });
    await page.goto(server.url, { waitUntil: "networkidle" });
    await page.waitForSelector("#preview[data-ready='true']", { timeout: 45000 });
    await page.locator("#preview").screenshot({ path: outputPath });
  } finally {
    await browser.close();
    await server.close();
  }
}
