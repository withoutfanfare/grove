# Grove — Bug Hunt & Performance Roadmap

Comprehensive audit of the Grove codebase (Vue 3 frontend, Rust/Tauri backend, build configuration) conducted 2026-01-31.

---

## Critical

### C1. Memory leak: useWorktreeWatcher callbacks never cleared
- **File**: `src/composables/useWorktreeWatcher.ts:40`
- **Area**: Frontend
- **Problem**: `changeCallbacks` is module-level and persists across component instances. Unmounted components that don't call the unregister function leak callbacks indefinitely.
- **Fix**: Auto-cleanup via `onUnmounted` inside the composable, or document that callers must unregister.

### C2. Race condition: useOperationProgress unlisten not awaited
- **File**: `src/composables/useOperationProgress.ts:136-141`
- **Area**: Frontend
- **Problem**: `stopListening()` calls `unlisten()` without awaiting it, then nullifies the reference. A new listener started before cleanup completes can cause duplicate handlers.
- **Fix**: Await the unlisten promise before nullifying.

### C3. Mutex poisoning crashes throughout Rust backend
- **Files**: `src-tauri/src/wt.rs:251-258`, `watcher.rs:147`, `tray.rs:290-293`
- **Area**: Backend
- **Problem**: All `Mutex::lock().unwrap()` calls will panic if the mutex is poisoned by a prior panic, making the app permanently unusable.
- **Fix**: Use `.lock().unwrap_or_else(|e| e.into_inner())` or explicit error handling at each site.

### C4. Regex compiled on every error (hot path)
- **File**: `src-tauri/src/wt.rs:203-218`
- **Area**: Backend / Performance
- **Problem**: `sanitise_error_message()` compiles three regex patterns on every call. Called for every CLI error.
- **Fix**: Use `lazy_static!` or `std::sync::OnceLock` to compile once. ~1000x speedup on error paths.

### C5. No timeout on sidecar CLI execution
- **File**: `src-tauri/src/wt.rs:401-480`
- **Area**: Backend
- **Problem**: Acknowledged in a comment but unimplemented. Hanging network operations (e.g. `git fetch` on a dead remote) freeze the app indefinitely.
- **Fix**: Wrap sidecar output in `tokio::time::timeout(Duration::from_secs(300), ...)`.

### C6. Backup files never cleaned up on error
- **File**: `src-tauri/src/config_files.rs:258-262`
- **Area**: Backend
- **Problem**: `.bak` files are created before writes but not removed if the subsequent operation fails. Accumulates stale backups over time.
- **Fix**: RAII guard or explicit cleanup in error paths.

### C7. `is_none_or()` requires Rust >= 1.82
- **File**: `src-tauri/src/operation_state.rs:176`
- **Area**: Backend
- **Problem**: `is_none_or()` is a recent addition to `Option`. Builds fail on older toolchains.
- **Fix**: Replace with `map_or(true, |ext| ext == "json")` or pin minimum Rust version.

---

## High

### H1. Missing error handling in App.vue tray listener
- **File**: `src/App.vue:34-45`
- **Area**: Frontend
- **Problem**: `listen()` call has no try-catch; failures are silently swallowed. Hardcoded 500ms `setTimeout` before focusing a worktree — if loading takes longer, the focus action fails silently.
- **Fix**: Await `loadingWorktrees` becoming false instead of guessing timing. Add try-catch.

### H2. Race condition in Dashboard repo switching
- **File**: `src/components/Dashboard.vue:129-147`
- **Area**: Frontend
- **Problem**: Rapid repo switches can display stale worktree data. The `fetchCounter` check happens after the async call completes, but the counter may have incremented multiple times.

### H3. Missing debounce cleanup on Dashboard unmount
- **File**: `src/components/Dashboard.vue:96-100, 120-126`
- **Area**: Frontend
- **Problem**: `handleWorktreeChange` debounce isn't cancelled in `onUnmounted`. Pending calls fire after the component is gone.

### H4. WorktreeCard flag not reset on synchronous throw
- **File**: `src/components/WorktreeCard.vue:40-41, 139-186`
- **Area**: Frontend
- **Problem**: `isLocalPulling`/`isLocalSyncing` are set before the try block. A synchronous throw leaves the button permanently disabled.

### H5. Stale state update after panel unmount
- **File**: `src/components/WorktreeDetailsPanel.vue:55-83`
- **Area**: Frontend
- **Problem**: Fetch operations for commits and files don't handle component unmount. Rapidly toggling the details panel can cause state updates on an unmounted component.

### H6. No loading feedback on repository selection
- **File**: `src/components/RepoList.vue:121-145`
- **Area**: Frontend / UX
- **Problem**: 10-second timeout with only a spinner on the button. No toast or status message tells the user what's happening.

### H7. Zombie sidecar processes on app crash
- **File**: `src-tauri/src/wt.rs` (multiple)
- **Area**: Backend
- **Problem**: No process group or Drop cleanup for spawned sidecar processes. Crash leaves orphaned git processes.

### H8. Path traversal in config file creation
- **File**: `src-tauri/src/config_files.rs:383-396`
- **Area**: Backend / Security
- **Problem**: Parent directory is validated but the filename itself could contain path separators, allowing writes outside the intended directory.

### H9. Unbounded watcher event buffer
- **File**: `src-tauri/src/watcher.rs:78-111`
- **Area**: Backend / Performance
- **Problem**: No backpressure on filesystem event buffering. Rapid changes can cause memory exhaustion.

### H10. Mutex contention serialises parallel pull operations
- **File**: `src-tauri/src/wt.rs:1191-1228`
- **Area**: Backend / Performance
- **Problem**: `op_state_ref.lock()` inside parallel closures turns concurrent work into serial under contention.
- **Fix**: Use atomic counters or message passing for progress tracking.

### H11. STATE_CACHE grows unbounded
- **File**: `src-tauri/src/operation_state.rs:82-84`
- **Area**: Backend / Performance
- **Problem**: Old operation states are never evicted from the in-memory cache.
- **Fix**: LRU eviction or periodic cleanup of entries older than N hours.

### H12. Blocking I/O in async context
- **File**: `src-tauri/src/operation_state.rs:74`
- **Area**: Backend / Performance
- **Problem**: `fs::write()` blocks the Tokio executor thread.
- **Fix**: Use `tokio::fs::write()` or wrap in `spawn_blocking`.

### H13. No progress event rate limiting
- **File**: `src-tauri/src/wt.rs:902-922`
- **Area**: Backend / Performance
- **Problem**: Progress events emitted per-worktree with no throttling. IPC flooding on large repos.

### H14. `tauri:build` script doesn't run Vite build
- **File**: `package.json`
- **Area**: Build
- **Problem**: `tauri:build` calls `npm run build` which only runs `vue-tsc --noEmit` (type check). The actual Vite build step is missing.
- **Fix**: `"tauri:build": "npm run prepare-sidecar && vue-tsc --noEmit && vite build && tauri build"`

### H15. Missing Cargo release profile optimisations
- **File**: `src-tauri/Cargo.toml`
- **Area**: Build / Performance
- **Problem**: No LTO, no strip, default codegen-units. Larger binary than necessary.
- **Fix**: Add `[profile.release]` with `opt-level = "z"`, `lto = true`, `codegen-units = 1`, `strip = true`, `panic = "abort"`.

### H16. Missing Vite production build config
- **File**: `vite.config.ts`
- **Area**: Build / Performance
- **Problem**: No chunk splitting, no minification config, no sourcemap settings.
- **Fix**: Add `build.rollupOptions.output.manualChunks` for vendor splitting.

### H17. Outdated major dependencies
- **File**: `package.json`
- **Area**: Build
- **Problem**: `@vitejs/plugin-vue` 5.x (current 6.x), `vite` 6.x (current 7.x), `vue-tsc` 2.x (current 3.x).

---

## Medium

### M1. Missing ARIA labels on icon buttons
- **Files**: Multiple components using `<IconButton>`
- **Area**: Frontend / Accessibility
- **Problem**: Icon-only buttons rely on tooltips, which screen readers can't access until focused. Add `aria-label` to all icon buttons.

### M2. Modal missing focus trap
- **File**: `src/components/ui/Modal.vue`
- **Area**: Frontend / Accessibility
- **Problem**: Users can tab outside the modal to background elements, breaking keyboard accessibility (WCAG 2.1).

### M3. Modal not announced to screen readers
- **File**: `src/components/ui/Modal.vue`
- **Area**: Frontend / Accessibility
- **Problem**: Has `role="dialog"` and `aria-modal="true"` but missing `aria-labelledby` pointing to the modal title.

### M4. Stale closure in useAutoRefresh window focus handler
- **File**: `src/composables/useAutoRefresh.ts:294-326`
- **Area**: Frontend
- **Problem**: `isEnabled`/`isPaused` checked outside the setTimeout, capturing stale values.

### M5. Unicode handling in search highlight
- **File**: `src/composables/useSearch.ts:94-114`
- **Area**: Frontend
- **Problem**: `slice()` uses UTF-16 offsets; emoji/multi-byte characters break highlighting.

### M6. Missing OperationProgressPanel error boundary
- **File**: `src/components/Dashboard.vue:695-698`
- **Area**: Frontend
- **Problem**: Malformed progress data crashes the entire app (no ErrorBoundary wrapper).

### M7. Virtual scroll active on small filtered lists
- **File**: `src/components/Dashboard.vue:656-672`
- **Area**: Frontend / Performance
- **Problem**: Virtualisation threshold checks total count, not filtered count. 100 items filtered to 5 still uses virtual scroll.

### M8. 35 console.log statements in production
- **Files**: 11 files
- **Area**: Frontend / Performance
- **Problem**: Unguarded console logging in production builds.
- **Fix**: Vite plugin to strip in production, or gate with `import.meta.env.DEV`.

### M9. Unnecessary AppHandle cloning in commands
- **File**: `src-tauri/src/commands.rs` (multiple)
- **Area**: Backend / Performance
- **Problem**: AppHandle cloned twice — once before `spawn_blocking`, once inside.

### M10. Hardcoded thread count (4)
- **File**: `src-tauri/src/wt.rs:60`
- **Area**: Backend / Performance
- **Problem**: `DEFAULT_THREAD_COUNT = 4` regardless of CPU. Suboptimal on high-core or low-core machines.

### M11. Lossy UTF-8 conversion silent
- **File**: `src-tauri/src/wt.rs:474-478`
- **Area**: Backend
- **Problem**: Replacement characters logged to stderr only; frontend never knows data was corrupted.

### M12. Missing Node.js and Rust version pinning
- **Files**: Missing `.nvmrc`, missing `rust-toolchain.toml`
- **Area**: Build
- **Problem**: No version specification for build reproducibility.

### M13. Package name mismatch
- **Files**: `package.json` ("grove") vs `package-lock.json` ("wt-app")
- **Area**: Build

### M14. Dropdown position stale on scroll
- **File**: `src/components/ui/Dropdown.vue:70-74`
- **Area**: Frontend
- **Problem**: Dropdown closes on scroll, but position may be briefly stale during the scroll event.

### M15. Empty search state doesn't show total count
- **File**: `src/components/Dashboard.vue:638-654`
- **Area**: Frontend / UX
- **Problem**: When search returns no results, no indication of how many worktrees exist. Change to "No matches in {n} worktrees".

### M16. Progress panel doesn't auto-close on success
- **File**: `src/components/Dashboard.vue:321-324`
- **Area**: Frontend / UX
- **Problem**: When all items in a bulk operation succeed, the panel stays open requiring manual close.

---

## Low

### L1. useToast timers run after app unmount
- **File**: `src/composables/useToast.ts:44`

### L2. SearchInput may emit on every keystroke without debounce
- **File**: `src/components/SearchInput.vue`

### L3. Missing keyboard navigation on WorktreeCard
- **File**: `src/components/WorktreeCard.vue:67-69`
- **Problem**: Details panel toggle only responds to click, not Space/Enter.

### L4. VIRTUALISATION_THRESHOLD magic number undocumented
- **File**: `src/components/Dashboard.vue:31`

### L5. Inconsistent error code style in Rust
- **Files**: Multiple — some use constants, some inline strings.

### L6. Magic numbers in fs_safety and config_files
- **Files**: `src-tauri/src/fs_safety.rs:189`, `config_files.rs:256`

### L7. Hardcoded z-index values
- **File**: `src/components/ui/Dropdown.vue:115`
- **Problem**: `z-[9999]` instead of using `--z-popover` design token.

### L8. Hardcoded colour values
- **Files**: `src/components/WorktreeCard.vue:295`, `src/components/RepoList.vue:508`
- **Problem**: Inline `#334155` instead of design tokens.

### L9. Hardcoded animation durations
- **File**: `src/components/WorktreeDetailsPanel.vue:168-173`
- **Problem**: Tailwind `duration-200`/`duration-150` instead of CSS custom properties per project convention.

### L10. Default base branch is project-specific
- **File**: `src/stores/settings.ts:49`
- **Problem**: Default `origin/staging` is developer-specific. Should default to `origin/main`.

### L11. No pre-commit hooks for quality gates
- **Area**: Build

### L12. `authors = ["you"]` placeholder in Cargo.toml
- **File**: `src-tauri/Cargo.toml:3`

### L13. Splash screen minimum display time
- **File**: `src/App.vue:47-48`
- **Problem**: Fixed 1200ms feels artificially slow on fast systems. Consider 600-800ms.

---

## Test Coverage

Neither frontend nor backend has meaningful automated test coverage beyond a few Rust unit tests for validators.

- **Frontend**: Zero test files. No unit tests for composables, no component tests, no E2E tests.
- **Backend**: Validator tests exist but no integration tests for command flows, async error paths, mutex recovery, watcher events, or cross-platform logic.
- **Priority**: Composable unit tests first (race conditions are hard to catch manually), then Rust integration tests for sidecar lifecycle.
