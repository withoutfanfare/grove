#!/bin/bash
# Prepare wt CLI as a sidecar binary for Tauri bundling
#
# This script copies the wt CLI binary from the parent repository to the
# src-tauri/binaries directory with the correct target triple suffix required
# by Tauri's sidecar system.
#
# Usage:
#   ./scripts/prepare-sidecar.sh
#
# Prerequisites:
#   - The wt CLI must be built in the parent directory (run ../build.sh first)
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

# Path to the wt CLI in the parent repository
WT_SOURCE="$PROJECT_ROOT/../wt"

if [ ! -f "$WT_SOURCE" ]; then
    echo "Error: wt CLI not found at $WT_SOURCE"
    echo "Please build the wt CLI first by running: cd .. && ./build.sh"
    exit 1
fi

# Create binaries directory
BINARIES_DIR="$PROJECT_ROOT/src-tauri/binaries"
mkdir -p "$BINARIES_DIR"

# Copy with target triple suffix
DEST="$BINARIES_DIR/wt-$TARGET"
cp "$WT_SOURCE" "$DEST"
chmod +x "$DEST"

echo "Prepared sidecar binary: wt-$TARGET"
echo "Location: $DEST"
