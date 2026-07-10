/*
  ship embed hook
  ----------------
  Loaded by every screen (plain <script>, like audio-engine.js). Does
  nothing unless the screen is opened with `?embed=1`, i.e. inside the
  single-window console (app.html). When embedded it lets the parent shell:

    parent → child (call these directly, inside a real user gesture, since
    the shell and the iframes are same-origin so activation carries):
      child.__shipBoot()                       start audio + the render loop
      child.__shipConfig({ fps, volume })      throttle the loop / set volume

  It also hides the screen's own boot overlay and floating controls (the
  shell owns those), and throttles requestAnimationFrame so rail previews
  can run at a low frame rate without touching each screen's loop code.

  Boot works by clicking the screen's existing #boot-btn, so the normal
  start path runs unchanged — no per-screen boot logic is duplicated here.
  Requires each screen to use the shared ids: #boot-btn, #boot-overlay.
*/
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  if (!params.has('embed')) return;

  var state = { fps: 60, volume: 1, booted: false };
  window.__shipState = state;

  // Hide standalone chrome — the shell provides its own.
  function hideChrome() {
    var style = document.createElement('style');
    // Control containers vary by screen: #controls (comms, nav-core) vs
    // .float-controls (all later screens). Hide both, plus the boot overlay.
    style.textContent = '#boot-overlay{display:none!important}.float-controls,#controls{display:none!important}';
    (document.head || document.documentElement).appendChild(style);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hideChrome);
  else hideChrome();

  // Throttle rAF for low-frame-rate rail previews. Screens call the global
  // requestAnimationFrame each frame, so wrapping it throttles every loop
  // uniformly without editing any screen's animation code.
  var realRAF = window.requestAnimationFrame.bind(window);
  var last = 0;
  window.requestAnimationFrame = function (cb) {
    return realRAF(function ticker(t) {
      var fps = state.fps || 60;
      if (fps >= 55) return cb(t);
      if (t - last >= (1000 / fps) - 1) { last = t; return cb(t); }
      return realRAF(ticker);
    });
  };

  function applyVolume() {
    var e = window.__shipEngine;
    if (e && e.setSpatialGain) { e.setSpatialGain(0.85 * state.volume); e.setStandardGain(0.55 * state.volume); }
  }

  function boot() {
    if (state.booted) { applyVolume(); return; }
    state.booted = true;
    var btn = document.getElementById('boot-btn');
    if (btn) btn.click();          // runs the screen's real start() within the caller's gesture
    setTimeout(applyVolume, 300);  // the engine's buses exist only after start()
  }

  window.__shipBoot = boot;
  window.__shipConfig = function (cfg) {
    if (!cfg) return;
    if (cfg.fps != null) state.fps = cfg.fps;
    if (cfg.volume != null) { state.volume = cfg.volume; applyVolume(); }
  };

  // postMessage fallback (same behaviour, for non-direct callers)
  window.addEventListener('message', function (ev) {
    var d = ev.data || {};
    if (d.type === 'ship:boot') boot();
    else if (d.type === 'ship:config') window.__shipConfig(d);
  });
})();
