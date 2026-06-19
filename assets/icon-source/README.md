# Grove Icon Source

These deterministic SVG files are the source of truth for Grove's icon system.

- `app-icon.svg`: Columnar Pine app icon, 1024 x 1024.
- `tray-icon.svg`: purpose-built macOS menu-bar template glyph, 22 x 22.

## Palette

- Tile highlight: `#263842`
- Tile core: `#18262E`
- Tile shadow: `#10191E`
- Pine highlight: `#D9E2DC`
- Pine mineral: `#9FB9B5`
- Pine blue: `#6D91A3`

The tray master must remain solid black on transparency. Do not add gradients,
shadows, antialiasing colours, or app-icon details to it.

## Generation

From the repository root:

```bash
npm run icons:generate
npm run icons:verify
```

The generation script uses the repository's Tauri CLI to build the standard
cross-platform application assets and dedicated 22 px / 44 px tray assets.
