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

  var state = { fps: 60, volume: 1, reactivity: 1, booted: false };
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
    if (e && e.setSpatialGain) { e.setSpatialGain(0.85 * state.volume, 0); e.setStandardGain(0.55 * state.volume, 0); }
  }

  function applyReactivity() {
    var e = window.__shipEngine;
    if (e && e.setAudioReactivity) e.setAudioReactivity(state.reactivity);
  }

  function boot() {
    if (state.booted) { applyVolume(); applyReactivity(); applyPanel(); return; }
    state.booted = true;
    var btn = document.getElementById('boot-btn');
    if (btn) btn.click();          // runs the screen's real start() within the caller's gesture
    setTimeout(function () { applyVolume(); applyReactivity(); applyPanel(); }, 300);  // the engine's buses exist only after start()
  }

  function applyPanel() {
    if (state.panel && window.__shipPanelConfig) window.__shipPanelConfig(state.panel);
  }

  // "Minimal" (thumbnail) mode: show only the visualizer, no text chrome.
  // Rather than hide each screen's varied labels/panels/lists, we find the
  // largest <canvas> (always the main 3D/viz surface) and promote its
  // container to cover the whole frame on top, with an opaque background, so
  // all the text underneath is hidden. Then fire resize so the renderer
  // refits the canvas to the new full size. Works for all screens unchanged.
  // Text overlays that live *inside* a viewport container (so promoting the
  // container doesn't hide them). Hidden in minimal mode for a pure-viz look.
  var LABEL_HIDE = '.vp-label,.cap,.sel-name,.sel-sub,.breach-flag,#anom-flag,' +
    '#contact-list,.cell .label,.cell .ts,.cell .rec,.cell .alert{display:none!important}';
  var minimalOn = false, promoted = null, prevInline = '', labelStyle = null;
  function applyMinimal(on) {
    if (on === minimalOn) return;
    minimalOn = on;
    if (on && !labelStyle) {
      labelStyle = document.createElement('style');
      labelStyle.textContent = LABEL_HIDE;
      (document.head || document.documentElement).appendChild(labelStyle);
    } else if (!on && labelStyle) {
      labelStyle.remove(); labelStyle = null;
    }
    if (on) {
      // The main visualizer is the screen's WebGL canvas (the Three.js
      // renderer). Spectrographs/oscilloscopes are 2D canvases. Detecting by
      // context type is robust even when a screen's grid collapses its main
      // cell at rail width — unlike measuring canvas/host size, which then
      // picks the wrong element. Promote that canvas's container to cover the
      // whole frame; a fired resize refits the renderer to the new full size.
      var host = null, best = null, bestArea = 0;
      [].forEach.call(document.querySelectorAll('canvas'), function (c) {
        var gl = null;
        try { gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'); } catch (e) {}
        if (gl && c.parentElement) host = c.parentElement;
        else if (c.parentElement) { // fallback: track largest 2D host
          var a = c.parentElement.offsetWidth * c.parentElement.offsetHeight;
          if (a > bestArea) { bestArea = a; best = c.parentElement; }
        }
      });
      host = host || best;
      if (!host) { minimalOn = false; return; }
      promoted = host;
      prevInline = promoted.getAttribute('style') || '';
      var bg = getComputedStyle(document.body).backgroundColor || '#000';
      promoted.style.cssText = prevInline +
        ';position:fixed;left:0;top:0;right:0;bottom:0;width:100%;height:100%;margin:0;padding:0;z-index:99999;background:' + bg + ';';
    } else if (promoted) {
      promoted.setAttribute('style', prevInline);
      promoted = null;
    }
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 0);
  }

  window.__shipBoot = boot;
  window.__shipConfig = function (cfg) {
    if (!cfg) return;
    if (cfg.fps != null) state.fps = cfg.fps;
    if (cfg.volume != null) { state.volume = cfg.volume; applyVolume(); }
    if (cfg.reactivity != null) { state.reactivity = cfg.reactivity; applyReactivity(); }
    if (cfg.panel != null) { state.panel = cfg.panel; applyPanel(); }
    if (cfg.minimal != null) applyMinimal(!!cfg.minimal);
  };

  // postMessage fallback (same behaviour, for non-direct callers)
  window.addEventListener('message', function (ev) {
    var d = ev.data || {};
    if (d.type === 'ship:boot') boot();
    else if (d.type === 'ship:config') window.__shipConfig(d);
  });
})();
