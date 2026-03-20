# Getting Started

## Prerequisites

Before using the Grove Worktree Manager app, you need:

1. **At least one repository** - Set up a repository with `grove`:
   ```bash
   # Register an existing git repository
   cd /path/to/your/repo
   grove setup
   ```

The `grove` CLI is bundled with the app - no separate installation required.

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
sudo dpkg -i grove_*.deb
```

**AppImage:**
```bash
chmod +x grove_*.AppImage
./grove_*.AppImage
```

## First Run

When you first launch the app:

1. **Repository Detection** - The app automatically detects repositories registered with `grove`

2. **Select a Repository** - Click a repository in the sidebar to view its worktrees. Grove will remember your last selected repository for next time.

3. **Explore Worktrees** - Each worktree card shows:
   - Branch name and short SHA
   - Health grade (A-F)
   - Dirty/clean status
   - Commits ahead/behind

### Single Instance

Grove prevents multiple instances from running. If you accidentally try to launch the app again while it's already running, the existing window will focus instead of opening a duplicate.

### Window Position

Grove remembers your window position, size, and whether it was maximised. The next time you launch, the window will appear exactly where you left it - perfect for multi-monitor setups.

### Global Shortcuts

After first launch, you can access Grove from anywhere using global keyboard shortcuts:

- **Cmd+Shift+G** (macOS) - Toggle the Grove window
- **Cmd+Shift+W** (macOS) - Show Grove and open quick worktree switcher

These shortcuts work even when Grove is hidden to the tray.

## Troubleshooting

### "Failed to initialise grove sidecar"

The bundled grove CLI failed to start. This is rare but can happen if:

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
- **In-App Help**: Press `?` or `Cmd+/` to open the help modal
- **Documentation**: See the [Features Guide](features.md)
- **Logs**: Check `~/Library/Logs/Grove/` (macOS) for diagnostic information
- **Issues**: Report bugs on GitHub
