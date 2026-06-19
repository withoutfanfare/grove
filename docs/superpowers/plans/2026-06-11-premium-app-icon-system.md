# Premium App Icon System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install the approved Columnar Pine Mineral Blue icon system throughout the Grove Tauri application and rebuild the application bundle.

**Architecture:** Deterministic SVG masters live under `assets/icon-source/`. Tauri's existing icon generator produces the cross-platform app icon set, while a small repository script renders the separate macOS tray template PNGs and verifies their purity. Existing Tauri bundle and tray integration paths remain unchanged.

**Tech Stack:** SVG, Node.js, Tauri CLI, Vue 3, Rust/Tauri

---

### Task 1: Create Deterministic Vector Masters

**Files:**
- Create: `assets/icon-source/app-icon.svg`
- Create: `assets/icon-source/tray-icon.svg`
- Create: `assets/icon-source/README.md`

- [ ] Create the 1024 x 1024 Columnar Pine Mineral Blue app-icon SVG.
- [ ] Create the separate 22 x 22 black-on-transparency tray SVG.
- [ ] Document the fixed palette, geometry, and source-of-truth rules.
- [ ] Validate both SVGs parse and have the expected view boxes.

### Task 2: Add Deterministic Tray Generation and Validation

**Files:**
- Create: `scripts/generate-icons.mjs`
- Modify: `package.json`

- [ ] Add a Node script that invokes the Tauri CLI for the app icon.
- [ ] Render the tray SVG to 22 x 22 and 44 x 44 PNGs.
- [ ] Validate dimensions, alpha, and black-only non-transparent tray pixels.
- [ ] Add `npm run icons:generate` and `npm run icons:verify`.

### Task 3: Generate and Integrate Production Assets

**Files:**
- Modify: `assets/grove.png`
- Modify: `src-tauri/icons/**`
- Modify: `src/components/LoadingScreen.vue`

- [ ] Generate the complete Tauri icon set from the approved app master.
- [ ] Generate and install the dedicated tray PNG assets.
- [ ] Replace the legacy Grove preview PNG.
- [ ] Replace the loading-screen branch illustration with the Columnar Pine.
- [ ] Run icon validation after generation.

### Task 4: Document the Icon System

**Files:**
- Create: `docs/developers/icons.md`
- Modify: `docs/developers/README.md`

- [ ] Document source artwork, generation, integration, and validation.
- [ ] Link the icon guide from the developer documentation index.

### Task 5: Verify and Rebuild

**Files:**
- Verify: generated assets and application bundle

- [ ] Inspect generated app and tray assets at large and small sizes.
- [ ] Run `npm run icons:verify`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `cd src-tauri && cargo fmt --check`.
- [ ] Run `cd src-tauri && cargo test`.
- [ ] Run `cd src-tauri && cargo clippy -- -D warnings`.
- [ ] Run `npm run tauri:build`.
- [ ] Launch the built application and inspect Dock and menu-bar icons where permitted.
- [ ] Commit the scoped implementation.

