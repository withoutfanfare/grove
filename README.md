<!-- DRAFT: Danny to review -->
# Grove

[![Tests](https://github.com/withoutfanfare/grove/actions/workflows/test.yml/badge.svg)](https://github.com/withoutfanfare/grove/actions/workflows/test.yml)

<p align="center">
  <img src="assets/grove.png" alt="Grove app icon" width="144" height="144">
</p>

Grove is a macOS desktop app for managing git worktrees across many repositories. It is a graphical front end for the [`grove` command-line tool](https://github.com/withoutfanfare/grove-cli), which keeps every branch in its own folder so you can work on several at once.

It is for developers who keep several worktrees open at a time and want to see, at a glance, which ones have uncommitted changes, which are behind their remote, and which are safe to clean up.

## What it does

- An Overview screen across all repositories: totals, a "Needs attention" list (dirty, behind remote, cleanup candidates, health issues) and your recent worktrees.
- A card per worktree with branch, short commit, health grade, dirty state and commits ahead or behind.
- Pull, open in your editor or terminal, and remove worktrees, with a check that stops a removal that would lose work.
- Global shortcuts: Cmd+Shift+G toggles the window, Cmd+Shift+W opens the worktree switcher.

## Install and run

There are no published releases yet, so build it from source. You need macOS, Node.js, Rust (stable) and the Tauri 2 prerequisites.

```bash
# 1. Build the grove CLI, which the app bundles
git clone https://github.com/withoutfanfare/grove-cli.git
(cd grove-cli && ./build.sh)

# 2. Build the app next to it
git clone https://github.com/withoutfanfare/grove.git
cd grove
npm ci
npm run tauri:build
```

Danny to confirm: `npm ci` currently needs the `@stuntrocket/ui` package, which is not yet on the public npm registry.

For development with hot reload, run `npm run tauri dev` instead of `npm run tauri:build`.

## Example

Register a repository with the CLI, then open Grove:

```bash
cd /path/to/your/repo
grove setup
```

Grove finds every repository registered with `grove` and lists its worktrees in the sidebar.

## Tests

```bash
npm test                       # frontend tests (Vitest)
cd src-tauri && cargo test     # Rust tests
```

## Documentation

- [Getting started](docs/users/getting-started.md)
- [Features](docs/users/features.md)
- [All documentation](docs/README.md)
- [Changelog](CHANGELOG.md)

## How this was built

Grove was built with the help of AI coding agents, mainly Claude Code and Codex. Every change was reviewed and tested by Danny Harding before it was merged.

## Licence

MIT. See [LICENSE](LICENSE).
