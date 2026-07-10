#!/usr/bin/env python3
"""
Ship Data Screen Simulator — dev / app server.

Zero-dependency: Python 3 standard library only, matching the project's
no-build / no-npm ethos. Serves all the static screens AND a small JSON API
that the static files can't provide on their own (persisting launcher
layouts server-side).

Why run a server at all when the screens open straight from disk?
  - Live microphone input requires a "secure context"; http://localhost
    counts, file:// does not. Serving here unlocks real mic-reactive audio.
  - It adds a persistence API for saving/loading launcher slot layouts.

Endpoints
  GET  /api/health   -> { "status": "ok", "screens": N, "presets": M }
  GET  /api/presets  -> { "presets": { "<name>": { "slots": [...], ... } } }
  POST /api/presets  -> body { "name": "...", "slots": [...] } ; saves a layout

Anything else is served as a static file from this directory.

Run
  python3 server.py                # http://localhost:8000
  PORT=9000 python3 server.py      # custom port
  python3 server.py 9000           # custom port (positional)

Everything still works opened directly via file:// — the API simply isn't
present there and the launcher degrades gracefully (layout controls hide).
"""

import json
import os
import sys
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
PRESETS_FILE = os.path.join(DATA_DIR, "presets.json")


def _load_presets():
    try:
        with open(PRESETS_FILE, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"presets": {}}


def _save_presets(store):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(PRESETS_FILE, "w", encoding="utf-8") as fh:
        json.dump(store, fh, indent=2)


class ShipHandler(SimpleHTTPRequestHandler):
    """Static file server (rooted at the project dir) plus a tiny JSON API."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # --- helpers -------------------------------------------------------
    def _send_json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        # Dev server: never cache, so edits to screens show up on reload.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # --- routing -------------------------------------------------------
    def do_GET(self):
        if self.path == "/api/health":
            store = _load_presets()
            return self._send_json({
                "status": "ok",
                "screens": _count_screens(),
                "presets": len(store.get("presets", {})),
            })
        if self.path == "/api/presets":
            return self._send_json(_load_presets())
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/presets":
            return self._send_json({"error": "not found"}, status=404)
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
            name = str(payload.get("name", "")).strip()
            slots = payload.get("slots", [])
            if not name or not isinstance(slots, list):
                raise ValueError("expected { name: str, slots: [...] }")
        except (ValueError, json.JSONDecodeError) as exc:
            return self._send_json({"error": str(exc)}, status=400)

        store = _load_presets()
        store.setdefault("presets", {})[name] = {
            "slots": slots,
            "saved": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        _save_presets(store)
        return self._send_json({"ok": True, "name": name, "presets": store["presets"]})

    def log_message(self, fmt, *args):  # quieter, single-line logging
        sys.stderr.write("%s  %s\n" % (self.address_string(), fmt % args))


def _count_screens():
    screens_dir = os.path.join(ROOT, "screens")
    try:
        return sum(1 for f in os.listdir(screens_dir) if f.endswith(".html"))
    except FileNotFoundError:
        return 0


def main():
    port = 8000
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    elif os.environ.get("PORT"):
        port = int(os.environ["PORT"])

    httpd = ThreadingHTTPServer(("0.0.0.0", port), ShipHandler)
    base = "http://localhost:%d" % port
    print("Ship Data Screen Simulator — server running")
    print("  Bridge Console : %s/app.html   (single-window data wall)" % base)
    print("  Multi-window   : %s/launcher.html" % base)
    print("  API health     : %s/api/health" % base)
    print("  Serving        : %s" % ROOT)
    print("  Stop           : Ctrl+C")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        httpd.shutdown()


if __name__ == "__main__":
    main()
