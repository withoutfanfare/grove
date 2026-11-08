#!/bin/bash
# Bundle exactly the reviewed CLI input recorded in sidecar.lock.json.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TARGET=$(rustc --print host-tuple 2>/dev/null || rustc -vV | sed -n 's/host: //p')
[ -n "$TARGET" ] || { echo 'Could not determine Rust target'; exit 1; }
GROVE_SOURCE="${GROVE_CLI_SOURCE:-$PROJECT_ROOT/../grove-cli/grove}"
PIN="$PROJECT_ROOT/src-tauri/sidecar.lock.json"
[ -f "$GROVE_SOURCE" ] || { echo 'Build the pinned grove-cli checkout first, or set GROVE_CLI_SOURCE'; exit 1; }
BINARIES_DIR="$PROJECT_ROOT/src-tauri/binaries"
DEST="$BINARIES_DIR/grove-$TARGET"
STAGED="$DEST.staged"
mkdir -p "$BINARIES_DIR"
# Verify the copy itself, so the bundled bytes are exactly the ones checked.
cp "$GROVE_SOURCE" "$STAGED"
python3 - "$STAGED" "$PIN" <<'PY' || { rm -f "$STAGED"; exit 1; }
import hashlib,json,sys
source,pin=sys.argv[1:]
expected=json.load(open(pin))
actual=hashlib.sha256(open(source,'rb').read()).hexdigest()
if actual != expected['sha256']:
    raise SystemExit('CLI digest differs from sidecar.lock.json; review and pin the intended CLI before bundling')
print('Verified CLI sha256 '+actual+' at revision '+expected['revision'])
PY
chmod +x "$STAGED"
mv "$STAGED" "$DEST"
echo "Prepared pinned sidecar: grove-$TARGET"
