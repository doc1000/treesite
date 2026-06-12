import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import toolBridgePlugin from "./server/toolBridge.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), toolBridgePlugin()],
  resolve: {
    alias: {
      "treesite-map": path.resolve(__dirname, "../shared/treesite-map/index.jsx"),
    },
  },
  server: { port: 5175 },
});
