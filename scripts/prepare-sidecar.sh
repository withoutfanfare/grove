#!/bin/bash
# Prepare grove CLI as a sidecar binary for Tauri bundling
#
# This script copies the grove CLI binary from the grove-cli repository to the
# src-tauri/binaries directory with the correct target triple suffix required
# by Tauri's sidecar system.
#
# Usage:
#   ./scripts/prepare-sidecar.sh
#
# Prerequisites:
#   - The grove CLI must be built in the grove-cli directory (run ../grove-cli/build.sh first)
#   - Rust must be installed (to get the target triple)

set -e

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Get the current platform's target triple
TARGET=$(rustc --print host-tuple 2>/dev/null || rustc -vV | sed -n 's/host: //p')

if [ -z "$TARGET" ]; then
    echo "Error: Could not determine target triple. Is Rust installed?"
    exit 1
fi

# Path to the grove CLI in the grove-cli repository
GROVE_SOURCE="$PROJECT_ROOT/../grove-cli/grove"

if [ ! -f "$GROVE_SOURCE" ]; then
    echo "Error: grove CLI not found at $GROVE_SOURCE"
    echo "Please build the grove CLI first by running: cd ../grove-cli && ./build.sh"
    exit 1
fi

# Create binaries directory
BINARIES_DIR="$PROJECT_ROOT/src-tauri/binaries"
mkdir -p "$BINARIES_DIR"

# Copy with target triple suffix
DEST="$BINARIES_DIR/grove-$TARGET"
cp "$GROVE_SOURCE" "$DEST"
chmod +x "$DEST"

echo "Prepared sidecar binary: grove-$TARGET"
echo "Location: $DEST"
