# Grove Documentation

Grove is a Tauri 2.0 desktop application providing a graphical interface for the `wt` git worktree manager CLI. It is designed for developers who manage multiple worktrees across one or more repositories and want a fast, keyboard-friendly native experience on macOS.

---

## User Documentation

| Document | Description |
|---|---|
| [Getting Started](users/getting-started.md) | Installation, first run, and troubleshooting |
| [Features](users/features.md) | Dashboard, keyboard shortcuts, system tray, and notifications |

---

## Developer Documentation

| Document | Description |
|---|---|
| [Developer Index](developers/README.md) | Overview of all developer documentation |
| [Setup](developers/setup.md) | Development environment setup |
| [Architecture](developers/architecture.md) | System architecture, data flow, and component design |
| [Building](developers/building.md) | Build process, distribution, and code signing |
| [Testing](developers/testing.md) | Test infrastructure using Vitest and Cargo test |
| [Sidecar](developers/sidecar.md) | Bundling the `wt` CLI as a Tauri sidecar binary |
| [Security](developers/security.md) | Threat model, input validation, and CSP configuration |

---

## API Reference

| Document | Description |
|---|---|
| [JSON API Specification](api/json-api-spec.md) | `wt` CLI JSON output format and API contract |

---

## Planning

### Roadmaps

| Document | Description |
|---|---|
| [Premium UI Polish](planning/roadmaps/premium-ui-polish.md) | UI animation and micro-interaction polish |
| [Tauri 2 Platform Features](planning/roadmaps/tauri2-platform-features.md) | Tauri 2 plugin adoption roadmap |
| [Feature Roadmap](planning/roadmaps/feature-roadmap.md) | Feature porting from the Raycast extension |
| [Product Roadmap](planning/roadmaps/product-roadmap.md) | Product roadmap across Phases 1–7 |
| [Performance Roadmap](planning/roadmaps/performance-roadmap.md) | Performance and UX optimisation |
| [Bug Fix Roadmap](planning/roadmaps/bug-fix-roadmap.md) | Code quality review and bug triage |

### Proposals

| Document | Description |
|---|---|
| [Tauri App Plan](planning/proposals/tauri-app-plan.md) | Original Tauri application planning document |
| [UI Overhaul Plan](planning/proposals/ui-overhaul-plan.md) | Premium UI redesign proposal |
| [Command Implementation Plan](planning/proposals/command-implementation-plan.md) | CLI-to-GUI command mapping |
| [CLI Dependency Evaluation](planning/proposals/cli-dependency-evaluation.md) | Native Rust versus CLI dependency analysis |

### Reviews

| Document | Description |
|---|---|
| [Quality-of-Life Review — February 2026](planning/reviews/qol-review-2026-02-16.md) | Quality-of-life audit conducted in February 2026 |
