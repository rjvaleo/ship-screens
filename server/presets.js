// Saved-layout persistence + a Vite plugin that reproduces server.py's tiny
// JSON API under `vite dev` / `vite preview`, so the launcher's "Saved Layouts"
// keep working with the modern toolchain instead of the Python server.
//
//   GET  /api/health   -> { status, screens, presets }
//   GET  /api/presets  -> { presets: { <name>: { slots, saved } } }
//   POST /api/presets  -> body { name, slots }  (saves a layout)
//
// The pure functions (loadPresets / savePreset / countScreens) are exported
// separately so they can be unit-tested without a running server.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function loadPresets(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return { presets: {} };
  }
}

export function savePreset(file, name, slots) {
  const cleanName = String(name ?? '').trim();
  if (!cleanName || !Array.isArray(slots)) {
    throw new Error('expected { name: str, slots: [...] }');
  }
  const store = loadPresets(file);
  store.presets = store.presets || {};
  store.presets[cleanName] = { slots, saved: new Date().toISOString() };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(store, null, 2));
  return store;
}

export function countScreens(dir) {
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.html')).length;
  } catch {
    return 0;
  }
}

// Shared request handler used by both the dev and preview servers.
function makeApiMiddleware({ file, screensDir }) {
  return function shipPresetsApi(req, res, next) {
    if (!req.url || !req.url.startsWith('/api/')) return next();
    const send = (obj, status = 200) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(obj));
    };

    if (req.method === 'GET' && req.url === '/api/health') {
      const store = loadPresets(file);
      return send({
        status: 'ok',
        screens: countScreens(screensDir),
        presets: Object.keys(store.presets || {}).length,
      });
    }
    if (req.method === 'GET' && req.url === '/api/presets') {
      return send(loadPresets(file));
    }
    if (req.method === 'POST' && req.url === '/api/presets') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const store = savePreset(file, payload.name, payload.slots);
          send({ ok: true, name: String(payload.name).trim(), presets: store.presets });
        } catch (e) {
          send({ error: String((e && e.message) || e) }, 400);
        }
      });
      return;
    }
    return next();
  };
}

export function presetsApiPlugin(opts = {}) {
  const root = opts.root || process.cwd();
  const file = opts.file || resolve(root, 'data', 'presets.json');
  const screensDir = opts.screensDir || resolve(root, 'screens');
  const mw = makeApiMiddleware({ file, screensDir });
  return {
    name: 'ship-presets-api',
    configureServer(server) { server.middlewares.use(mw); },
    configurePreviewServer(server) { server.middlewares.use(mw); },
  };
}
