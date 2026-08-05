# Sidecar Bundling

This document explains how the `grove` CLI is bundled with the Tauri app and the development workflow for working with it.

## What is a Sidecar?

A **sidecar** is an external binary that gets bundled alongside your Tauri application. When the app is distributed, the sidecar binary is included in the app bundle and can be executed at runtime.

In Tauri 2.0, sidecars are managed through the `tauri-plugin-shell` plugin and configured via `externalBin` in `tauri.conf.json`.

### Why Use a Sidecar?

For Grove, bundling the `grove` CLI as a sidecar provides:

1. **Self-contained distribution** - Users can install the app to `/Applications` without separately installing the grove CLI
2. **Version consistency** - The app always uses the bundled grove version, avoiding mismatches
3. **Simplified installation** - No PATH configuration or homebrew installation required
4. **Portable** - The app works immediately after installation on any machine

### How It Works

```text
┌─────────────────────────────────────────────────────────┐
│                    Grove.app Bundle                    │
├─────────────────────────────────────────────────────────┤
│  Contents/                                              │
│  ├── MacOS/                                             │
│  │   ├── Grove          (main Tauri executable)        │
│  │   └── grove           (sidecar binary)               │
│  ├── Resources/                                         │
│  │   └── ...             (frontend assets)              │
│  └── Info.plist                                         │
└─────────────────────────────────────────────────────────┘
```

At runtime:
1. The Rust backend uses `app.shell().sidecar("grove")` to get a handle to the bundled binary
2. Tauri resolves the correct path within the app bundle
3. The sidecar executes with the provided arguments
4. Output is captured and parsed as JSON

## Development Workflow

### Initial Setup

Before running the app for the first time:

```bash
# 1. Build the grove CLI in the grove-cli repository
cd /path/to/grove-cli
./build.sh

# 2. Navigate to Grove
cd grove

# 3. Install dependencies
npm install

# 4. Prepare the sidecar binary
npm run prepare-sidecar
```

The `prepare-sidecar` script:
- Copies the `grove` binary from `../grove-cli/grove`
- Renames it with a platform suffix (e.g., `grove-aarch64-apple-darwin`)
- Places it in `src-tauri/binaries/`

### Running Development Mode

```bash
npm run tauri dev
```

This works exactly like standard Tauri development:
- Vite dev server starts with hot reload for Vue changes
- Rust backend recompiles on changes
- App window opens automatically

### After Modifying the grove CLI

When you make changes to the grove CLI in the grove-cli repository:

```bash
# 1. Rebuild the grove CLI
cd ../grove-cli
./build.sh

# 2. Refresh the sidecar
cd ../grove
npm run prepare-sidecar

# 3. Restart dev mode (if running)
# The Rust backend will use the updated binary
```

**Important:** Changes to the grove CLI are not automatically picked up. You must run `prepare-sidecar` after each change.

## Production Builds

### Building for Distribution

```bash
npm run tauri:build
```

This command:
1. Runs `prepare-sidecar` automatically
2. Builds the Vue frontend
3. Compiles the Rust backend in release mode
4. Bundles everything into distributable formats

### Build Outputs

| Platform | Location |
|----------|----------|
| macOS .app | `src-tauri/target/release/bundle/macos/` |
| macOS .dmg | `src-tauri/target/release/bundle/dmg/` |
| Windows .msi | `src-tauri/target/release/bundle/msi/` |
| Linux .deb | `src-tauri/target/release/bundle/deb/` |
| Linux .AppImage | `src-tauri/target/release/bundle/appimage/` |

## Configuration Files

### tauri.conf.json

The sidecar is configured in the `bundle` section:

```json
{
  "bundle": {
    "externalBin": ["binaries/grove"]
  }
}
```

Tauri automatically appends the platform suffix when looking for the binary.

### capabilities/default.json

Shell permissions are required for sidecar execution:

```json
{
  "permissions": [
    "shell:default",
    {
      "identifier": "shell:allow-execute",
      "allow": [
        {
          "name": "binaries/grove",
          "sidecar": true,
          "args": true
        }
      ]
    }
  ]
}
```

### prepare-sidecar.sh

The script that copies the grove binary:

```bash
#!/bin/bash
set -e

# Get platform target triple
TARGET=$(rustc --print host-tuple)

# Copy binary with platform suffix
cp "../grove-cli/grove" "src-tauri/binaries/grove-$TARGET"
chmod +x "src-tauri/binaries/grove-$TARGET"
```

Building from a git worktree (e.g. `.claude/worktrees/<name>/`)? The sibling-checkout default (`../grove-cli/grove`) resolves relative to the worktree, not the main checkout, so it will not find the CLI. Set `GROVE_CLI_SOURCE` to the built `grove` binary's actual path to override it — see [Ledger Overlay](ledger-overlay.md) for why a stale or missing sidecar matters beyond a build failure.

## Rust Implementation

### Executing the Sidecar

All grove operations go through `execute_wt()` in `src-tauri/src/wt.rs`:

```rust
use tauri_plugin_shell::ShellExt;

fn execute_wt(app: &tauri::AppHandle, args: &[&str]) -> WtResult<String> {
    // Get sidecar handle
    let sidecar = app.shell().sidecar("grove")
        .map_err(|e| WtError::new("SIDECAR_ERROR", format!("{}", e)))?;

    // Execute and wait for output
    let output = tauri::async_runtime::block_on(async {
        sidecar.args(args).output().await
    })?;

    // Process output...
}
```

### AppHandle Threading

The sidecar API requires an `AppHandle`. All public functions in `wt.rs` accept it as their first parameter:

```rust
pub fn get_repositories(app: &tauri::AppHandle) -> WtResult<Vec<Repository>> {
    execute_wt_json_result(app, &["repos", "--json"])
}
```

Command handlers in `commands.rs` pass the handle from Tauri:

```rust
#[command]
pub async fn list_repositories(app: tauri::AppHandle) -> Result<Vec<Repository>, WtError> {
    let handle = app.clone();
    spawn_blocking(move || wt::get_repositories(&handle)).await.unwrap()
}
```

## Platform Suffixes

Tauri requires platform-specific binary names:

| Platform | Suffix |
|----------|--------|
| macOS (Apple Silicon) | `grove-aarch64-apple-darwin` |
| macOS (Intel) | `grove-x86_64-apple-darwin` |
| Windows | `grove-x86_64-pc-windows-msvc.exe` |
| Linux | `grove-x86_64-unknown-linux-gnu` |

To find your platform's suffix:

```bash
rustc --print host-tuple
```

## Troubleshooting

### "resource path doesn't exist" during build

The sidecar binary is missing. Run:

```bash
npm run prepare-sidecar
```

### "Failed to initialise grove sidecar" at runtime

1. Check the binary exists: `ls src-tauri/binaries/`
2. Verify the platform suffix matches your system
3. Ensure the binary is executable: `chmod +x src-tauri/binaries/grove-*`

### grove commands return errors after CLI update

The bundled binary is outdated. Refresh it:

```bash
cd ../grove-cli && ./build.sh && cd ../grove && npm run prepare-sidecar
```

### Cross-platform builds fail

You need the grove binary compiled for each target platform. Currently, the grove CLI is a shell script, so it only works on Unix-like systems (macOS, Linux).

## Architecture Diagram

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Vue Frontend  │────▶│  Rust Backend    │────▶│  grove Sidecar  │
│                 │     │                  │     │                 │
│  invoke()       │ IPC │  commands.rs     │     │  Bundled grove  │
│  useWt.ts       │────▶│  wt.rs           │────▶│  --json output  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │ tauri-plugin-    │
                        │ shell            │
                        │                  │
                        │ app.shell()      │
                        │ .sidecar("grove")│
                        └──────────────────┘
```

## Further Reading

- [Tauri 2.0 Sidecar Documentation](https://v2.tauri.app/develop/sidecar/)
- [tauri-plugin-shell Documentation](https://v2.tauri.app/plugin/shell/)
