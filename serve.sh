#!/usr/bin/env bash
# Launch the Ship Data Screen Simulator server.
# Usage:  ./serve.sh [port]        (default port 8000)
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8000}"
exec python3 server.py "$PORT"
