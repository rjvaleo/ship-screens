/*
  ShipMount — no-iframe pane hosting.
  ----------------------------------
  Mounts a screen's standalone HTML file directly into the current document
  (inside a Shadow DOM root), instead of loading it in an <iframe>. This lets
  many modules share one realm — and therefore one ShipAudioEngine EngineCore
  (see shared/audio-engine.js) — instead of each paying for its own
  AudioContext, its own Three.js/font loads, and its own document.

  Why this needs shimming, not a plain innerHTML injection:
    - Every screen's inline script calls the bare global `document.
      getElementById/querySelector(All)` — but Shadow DOM content is NOT
      reachable via the real `document`'s lookup methods, only via the shadow
      root's own. So each mounted instance's script needs its `document`
      identifier to resolve to ITS OWN shadow root, not the real document.
    - Every screen calls the bare global `requestAnimationFrame` — sharing the
      single true one across 10 instances would mean one throttle setting
      (fps) for all of them, breaking today's per-pane fps (center/rail/grid).
    - Some screens assign `window.__shipPanelConfig = fn` for the console's
      CTL panel — with 10 instances in one real `window`, the last one wins.
      Each instance needs its OWN object to assign onto.

  The trick: wrap each screen's inline script body in `new Function('document',
  'requestAnimationFrame', 'window', code)` and call it with per-instance
  proxies. Because those are the function's own parameter names, every bare
  reference to `document` / `requestAnimationFrame` / `window` anywhere in
  that script (including deeply nested closures like a render loop) resolves
  to the passed-in proxy, not the true global — no per-screen source rewrites
  needed. `<script src="…">` tags (Three.js CDN, shared/audio-engine.js,
  shared/embed.js) are real, shared, loaded at most once per realm.
*/
(function (global) {
  'use strict';

  const loadedOnce = new Set(); // shared <script src> / <link href> already loaded this realm

  function loadSharedScriptOnce(src, baseUrl) {
    const abs = new URL(src, baseUrl).href;
    if (loadedOnce.has(abs)) return Promise.resolve();
    loadedOnce.add(abs);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = abs;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('failed to load ' + abs));
      document.head.appendChild(s);
    });
  }

  function loadSharedStyleOnce(href, baseUrl) {
    const abs = new URL(href, baseUrl).href;
    if (loadedOnce.has(abs)) return;
    loadedOnce.add(abs);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = abs;
    document.head.appendChild(link);
  }

  // A per-instance `document` proxy scoped to this pane's own shadow root.
  function makeDocumentProxy(root) {
    return {
      getElementById: (id) => root.getElementById(id),
      querySelector: (sel) => root.querySelector(sel),
      querySelectorAll: (sel) => root.querySelectorAll(sel),
      createElement: (tag) => document.createElement(tag),
      createElementNS: (ns, tag) => document.createElementNS(ns, tag),
      createTextNode: (t) => document.createTextNode(t),
      createDocumentFragment: () => document.createDocumentFragment(),
      body: root,
      documentElement: root,
      head: root,
      readyState: 'complete',
      addEventListener: () => {}, // DOMContentLoaded etc: script runs after mount, already "ready"
      removeEventListener: () => {},
      dispatchEvent: () => true,
      location: global.location
    };
  }

  // A per-instance throttled requestAnimationFrame — same fps-gate behavior
  // shared/embed.js used to monkey-patch globally, now scoped per pane.
  function makeRafProxy(getFps) {
    let last = 0;
    function ticker(cb, t) {
      const fps = getFps() || 60;
      if (fps >= 55) return cb(t);
      if (t - last >= (1000 / fps) - 1) { last = t; return cb(t); }
      return global.requestAnimationFrame((tt) => ticker(cb, tt));
    }
    return function instanceRAF(cb) {
      return global.requestAnimationFrame((t) => ticker(cb, t));
    };
  }

  // A per-instance `window` proxy: real reads (addEventListener, RAF,
  // ResizeObserver, sizing) pass through to the true window/proxy so global
  // events like resize still reach every pane; arbitrary assignments (e.g.
  // `window.__shipPanelConfig = fn`) land as normal own-properties on THIS
  // object instead of colliding on the one real `window`.
  function makeWindowProxy(rafProxy) {
    const proxy = {
      addEventListener: (...a) => global.addEventListener(...a),
      removeEventListener: (...a) => global.removeEventListener(...a),
      requestAnimationFrame: rafProxy,
      ResizeObserver: global.ResizeObserver,
      location: global.location,
      get devicePixelRatio() { return global.devicePixelRatio; },
      get innerWidth() { return global.innerWidth; },
      get innerHeight() { return global.innerHeight; }
    };
    return proxy;
  }

  /**
   * Mount a screen's standalone HTML page into `container` via Shadow DOM.
   * Returns { root, host, windowProxy, getFps, setFps } once fully loaded and
   * executed. Screen scripts run exactly as they do standalone; only
   * `document` / `requestAnimationFrame` / `window` resolve to this pane's
   * own scope.
   */
  async function mount(url, container, opts) {
    opts = opts || {};
    // `new URL(relative, base)` requires `base` itself to already be
    // absolute — resolve the screen's own URL against the current document
    // once, then use that absolute form for every relative script/link
    // resolution below (script `src="../shared/…"`, font `<link>` hrefs).
    const absUrl = new URL(url, document.baseURI).href;
    const html = await fetch(absUrl).then((r) => {
      if (!r.ok) throw new Error('failed to fetch ' + absUrl + ': ' + r.status);
      return r.text();
    });
    const parsed = new DOMParser().parseFromString(html, 'text/html');

    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
    container.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });

    parsed.querySelectorAll('style').forEach((styleEl) => root.appendChild(styleEl.cloneNode(true)));
    parsed.querySelectorAll('link[rel="stylesheet"]').forEach((linkEl) => {
      const href = linkEl.getAttribute('href');
      if (href) loadSharedStyleOnce(href, absUrl);
    });
    Array.from(parsed.body.childNodes).forEach((node) => {
      if (node.nodeName === 'SCRIPT') return; // handled below
      root.appendChild(node.cloneNode(true));
    });

    let fps = 60;
    const rafProxy = makeRafProxy(() => fps);
    const windowProxy = makeWindowProxy(rafProxy);
    const documentProxy = makeDocumentProxy(root);

    const scripts = Array.from(parsed.querySelectorAll('script'));
    for (const scriptEl of scripts) {
      const src = scriptEl.getAttribute('src');
      const type = scriptEl.getAttribute('type');
      if (type === 'module') {
        // Not a screen's own code — e.g. Vite's injected dev-mode HMR client
        // (<script type="module" src="/@vite/client">). Let the browser's
        // real module loader handle it natively; it doesn't need (and can't
        // use) the document/rAF/window shim.
        if (src && !loadedOnce.has(new URL(src, absUrl).href)) {
          loadedOnce.add(new URL(src, absUrl).href);
          const s = document.createElement('script');
          s.type = 'module';
          s.src = new URL(src, absUrl).href;
          document.head.appendChild(s);
        }
        continue;
      }
      if (src) {
        await loadSharedScriptOnce(src, absUrl);
      } else {
        const fn = new Function('document', 'requestAnimationFrame', 'window', scriptEl.textContent);
        // shared/audio-engine.js runs unshimmed (it's loaded via <script src>
        // above), so its own `window.__shipEngine = this` etc. can't see this
        // instance's windowProxy directly. Set a transient real-global hint
        // it checks, for the duration of this synchronous script execution
        // only — see the matching check in ShipAudioEngine's constructor.
        global.__shipMountTarget = windowProxy;
        try { fn(documentProxy, rafProxy, windowProxy); }
        finally { global.__shipMountTarget = null; }
      }
    }

    return {
      root,
      host,
      windowProxy,
      setFps(v) { fps = v; },
      getFps() { return fps; },
      boot() {
        const btn = root.getElementById('boot-btn');
        if (btn) btn.click();
      },
      panelConfig(cfg) {
        if (windowProxy.__shipPanelConfig) windowProxy.__shipPanelConfig(cfg);
      }
    };
  }

  global.ShipMount = { mount };
})(window);
