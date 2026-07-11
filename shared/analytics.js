// Optional Google Analytics 4. Loaded as a plain (non-module) script like
// audio-engine.js, so it also works over file://. It NO-OPS unless a real
// measurement ID is present — nothing is loaded and nothing is sent by default.
//
// Enable it either way:
//   1. Build-time (recommended): set VITE_GA_ID in a .env file, and add
//        <meta name="ship-ga-id" content="%VITE_GA_ID%">
//      to a page's <head>. Vite replaces %VITE_GA_ID% at build; if it's unset
//      the literal "%..." is left in place and this script ignores it.
//   2. Runtime: set `window.SHIP_GA_ID = 'G-XXXXXXX'` before this script runs.
//
// Then include it after audio-engine.js:
//   <script src="../shared/analytics.js"></script>
//
// Other scripts can log events with:  window.shipTrack('boot', { screen: 'reactor' })
(function () {
  function readId() {
    if (typeof window.SHIP_GA_ID === 'string' && window.SHIP_GA_ID) return window.SHIP_GA_ID;
    var meta = document.querySelector('meta[name="ship-ga-id"]');
    var content = meta && meta.getAttribute('content');
    // Guard against an un-substituted "%VITE_GA_ID%" placeholder.
    if (content && content.indexOf('%') === -1 && content.indexOf('G-') === 0) return content;
    return null;
  }

  var id = readId();
  window.shipTrack = window.shipTrack || function () {}; // safe no-op until enabled
  if (!id) return; // analytics disabled

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', id);
  window.shipTrack = function (event, params) { window.gtag('event', event, params || {}); };
})();
