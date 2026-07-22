import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { readdirSync, cpSync } from 'node:fs';
import { presetsApiPlugin } from './server/presets.js';

const root = import.meta.dirname;

// The shared browser scripts are intentionally plain (non-module) scripts, so
// Vite leaves the `<script src="../shared/…">` tags untouched instead of
// bundling them. Copy the folder verbatim into dist/ so those references
// resolve in the built output (they already resolve in dev, served from root).
function copySharedAssets() {
  return {
    name: 'ship-copy-shared',
    apply: 'build',
    closeBundle() {
      cpSync(resolve(root, 'shared'), resolve(root, 'dist', 'shared'), { recursive: true });
    },
  };
}

// Multi-page app: every top-level page AND every screen is its own build entry,
// so the project keeps its "open a specific page directly" model — no SPA
// router, no merging screens together. Each screen stays a self-contained page.
const screenInputs = Object.fromEntries(
  readdirSync(resolve(root, 'screens'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => [`screens/${f.replace(/\.html$/, '')}`, resolve(root, 'screens', f)]),
);

export default defineConfig(({ command }) => ({
  root,
  // Serves on the same port as the old Python server, and reproduces its
  // /api/presets endpoints via the plugin so saved layouts still work.
  server: { port: 8000, host: true },
  preview: { port: 8000 },
  // Relative base so the built dist/ works from any path — including a
  // GitHub Pages project site (served from /<repo-name>/, not /). Dev server
  // stays rooted at '/' so localhost:8000 URLs are unaffected.
  base: command === 'build' ? './' : '/',
  plugins: [presetsApiPlugin({ root }), copySharedAssets()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        app: resolve(root, 'app.html'),
        launcher: resolve(root, 'launcher.html'),
        ...screenInputs,
      },
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.js'],
  },
}));
