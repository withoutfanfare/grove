# Getting Started

## Prerequisites

Before using the wt Worktree Manager app, you need:

1. **At least one repository** - Set up a repository with `wt`:
   ```bash
   # Register an existing git repository
   cd /path/to/your/repo
   wt setup
   ```

The `wt` CLI is bundled with the app - no separate installation required.

## Installation

### macOS

1. Download the `.dmg` file for your architecture:
   - Apple Silicon (M1/M2/M3): `*_aarch64.dmg`
   - Intel: `*_x64.dmg`

2. Open the DMG and drag the app to Applications

3. On first launch, you may need to allow the app in System Settings > Privacy & Security

### Windows

1. Download the `.msi` installer
2. Run the installer and follow the prompts
3. Launch from the Start Menu

### Linux

**Debian/Ubuntu:**
```bash
sudo dpkg -i wt-worktree-manager_*.deb
```

**AppImage:**
```bash
chmod +x wt-worktree-manager_*.AppImage
./wt-worktree-manager_*.AppImage
```

## First Run

When you first launch the app:

1. **Repository Detection** - The app automatically detects repositories registered with `wt`

2. **Select a Repository** - Click a repository in the sidebar to view its worktrees

3. **Explore Worktrees** - Each worktree card shows:
   - Branch name and short SHA
   - Health grade (A-F)
   - Dirty/clean status
   - Commits ahead/behind

## Troubleshooting

### "Failed to initialise wt sidecar"

The bundled wt CLI failed to start. This is rare but can happen if:

1. **App bundle is corrupted** - Re-download and reinstall the app
2. **Permissions issue** - On macOS, ensure the app is allowed in System Settings > Privacy & Security

### No repositories showing

If the sidebar is empty:

1. **Register repositories** - Use `wt setup` in each repo you want to manage

2. **Check wt directly** - Run `wt repos` to see registered repositories

3. **Refresh** - Click the refresh button in the app header

### Actions not working

If "Open in Code" or other actions fail:

1. **Check the path exists** - The worktree directory must exist
2. **Verify permissions** - Ensure you have read access to the directory
3. **Check for errors** - Error messages appear in the red banner at the top

## Getting Help

- **CLI Help**: `wt help` or `wt <command> --help`
- **Documentation**: See the [Features Guide](features.md)
- **Issues**: Report bugs on GitHub
