import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app consumes the TreeSite engine as a package. In this repo it resolves to
// the package source at ../lib; other sites install it from GitHub.
const enginePath = fileURLToPath(new URL('../lib/index.js', import.meta.url))
const engineStyles = fileURLToPath(new URL('../lib/styles.css', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@doc1000\/treesite\/styles\.css$/, replacement: engineStyles },
      { find: /^@doc1000\/treesite$/, replacement: enginePath }
    ],
    // ../lib sits outside this app, so make it share the app's React and d3.
    dedupe: ['react', 'react-dom', 'd3', 'pdfjs-dist']
  },
  server: {
    port: 5174,
    fs: { allow: ['..'] }
  }
})
