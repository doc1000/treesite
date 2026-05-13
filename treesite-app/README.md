# treesite-app

Vite + React sitemap UI. Content cards live in `content/items/`; use npm scripts (`add:card`, `edit:card`, **`rename:card`**, `move:card`, `rebuild:site-data`, …) — see the repo root [README](../README.md#rename-a-card-slug-display-name-and-treemap) for **`rename:card`** and other intake docs.

## npm scripts (content)

- **`npm run rename:card -- --from <slug> [--to <new-slug>] [--name ...]`** — renames the JSON file + slug, updates display fields, rewrites `/assets/` paths when the slug changes, runs **`rebuild:site-data`**.

---

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
