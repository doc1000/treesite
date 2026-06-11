import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// TODO Phase 2: register toolBridge middleware here

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
  },
});
