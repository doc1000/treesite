import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import toolBridgePlugin from "./server/toolBridge.mjs";

export default defineConfig({
  plugins: [react(), toolBridgePlugin()],
  server: { port: 5175 },
});
