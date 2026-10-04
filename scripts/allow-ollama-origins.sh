#!/usr/bin/env bash
# Lets OpenGrasp's Ask panel reach a local Ollama (systemd service on Linux).
# Adds a separate drop-in, so the service unit and any other drop-ins stay untouched.
# Usage: sudo ./scripts/allow-ollama-origins.sh
set -euo pipefail

# Origins are scheme + host (+ port), never a path: the GitHub Pages site is served from the github.io origin.
ORIGINS=(
  https://markosankovic.github.io
  # Any port: the dev server takes 5173, or 5174 when another app (e.g. Motion Master) already has 5173.
  'http://localhost:*'
  'http://127.0.0.1:*'
)

DROPIN_DIR=/etc/systemd/system/ollama.service.d
DROPIN=$DROPIN_DIR/opengrasp-origins.conf

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo $0" >&2
  exit 1
fi
if ! systemctl cat ollama.service >/dev/null 2>&1; then
  echo "No ollama.service found. Start Ollama by hand instead:" >&2
  echo "  OLLAMA_ORIGINS=$(IFS=,; echo "${ORIGINS[*]}") ollama serve" >&2
  exit 1
fi

mkdir -p "$DROPIN_DIR"
cat >"$DROPIN" <<EOF
# Written by OpenGrasp's scripts/allow-ollama-origins.sh. Delete this file to undo.
[Service]
Environment="OLLAMA_ORIGINS=$(IFS=,; echo "${ORIGINS[*]}")"
EOF
echo "Wrote $DROPIN"

systemctl daemon-reload
systemctl restart ollama.service

# Read the port from OLLAMA_HOST if the service sets it, else Ollama's default.
host=$(systemctl show ollama.service -p Environment | grep -o 'OLLAMA_HOST=[^ ]*' | cut -d= -f2 || true)
url="http://${host:-127.0.0.1:11434}"
url=${url/0.0.0.0/127.0.0.1}

for _ in $(seq 30); do curl -sf "$url/api/version" >/dev/null && break; sleep 1; done

status=0
for origin in https://markosankovic.github.io http://localhost:5173 http://localhost:5174; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Origin: $origin" "$url/v1/models" || true)
  if [[ $code == 200 ]]; then echo "ok    $origin"; else echo "FAIL  $origin ($code)"; status=1; fi
done
exit $status
