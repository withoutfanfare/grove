# Premium App Icon System Design

## Approved Direction

Grove uses the **Columnar Pine** symbol with the **Mineral Blue** finish.

The symbol preserves Grove's established tree identity while replacing the
current detailed illustration with a compact conifer silhouette. Its internal
paths suggest several active worktrees converging into one stable trunk.

## App Icon

- Rounded-square macOS-style tile.
- Deep ink background gradient:
  - highlight: `#263842`
  - core: `#18262E`
  - shadow: `#10191E`
- Columnar Pine mark gradient:
  - highlight: `#D9E2DC`
  - mineral: `#9FB9B5`
  - blue: `#6D91A3`
- Restrained inset border and soft mark shadow.
- No text, letters, literal illustration detail, or secondary motif.
- The outer conifer silhouette remains recognisable when internal paths are
  no longer visible at small sizes.

## Menu-Bar Icon

- Separate purpose-built Columnar Pine glyph, not a reduced app icon.
- Deterministic 22 x 22 SVG master.
- Solid black pixels on transparency in generated PNG assets.
- Generated at 22 x 22 and 44 x 44.
- Existing Tauri `icon_as_template(true)` behaviour remains enabled so macOS
  controls light, dark, and selected appearances.

## Editable Masters

Create under `assets/icon-source/`:

- `app-icon.svg`: 1024 x 1024 full-colour vector master.
- `tray-icon.svg`: 22 x 22 black template vector master.
- `README.md`: design rules and generation commands.

## Production Integration

- Generate the standard Tauri platform icon set from `app-icon.svg` into
  `src-tauri/icons/`.
- Generate dedicated tray PNGs from `tray-icon.svg`.
- Replace the legacy `assets/grove.png` preview with a rendered 1024 x 1024
  version of the approved app icon.
- Update `src/components/LoadingScreen.vue` to use the approved Columnar Pine
  silhouette.
- Keep existing `src-tauri/tauri.conf.json` icon paths and
  `src-tauri/src/tray.rs` template integration unless verification exposes a
  required correction.

## Documentation

Create `docs/developers/icons.md` covering:

- source files;
- palette and shape constraints;
- deterministic regeneration commands;
- menu-bar template requirements;
- verification commands.

Link it from the developer documentation index.

## Verification

- Inspect app and tray assets visually at large and small sizes.
- Verify expected dimensions and transparency.
- Verify tray PNG RGB pixels are black wherever alpha is non-zero.
- Run frontend tests and build.
- Run Rust formatting, tests, and Clippy.
- Build the actual Tauri application bundle.
- Launch the app and inspect Dock and menu-bar icons where the environment
  permits.

