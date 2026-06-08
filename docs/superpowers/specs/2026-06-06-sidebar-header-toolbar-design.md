# Sidebar Header Toolbar — Design

**Date:** 2026-06-06
**Status:** Approved (brainstorm complete, pending implementation plan)

## Summary

Restructure the top-left section of the sidebar (`RepoList.vue`) from four
stacked rows into three. The clone and global-config buttons move up beside
the Overview button to form a proper header row, the tab switcher gains count
chips on both tabs, and the floating stats row ("10 repos · 25 worktrees" /
"8 recent") is removed. The result is a tighter header with one consistent
left edge and no orphaned row.

## Decisions Made During Brainstorm

| Question | Decision |
|---|---|
| Direction | B — "Header toolbar" (chosen over refine-in-place and underline tabs) |
| Tab counts | Chips on **both** tabs (repos count + recent count, always visible) |
| Worktree total | Dropped from sidebar; already lives on the Overview page stat strip |
| Tab control style | Keep the existing sliding-pill segmented control |
| Search input | Unchanged, inset aligned with the rows above |

## Layout

All changes are within the tab header block of `RepoList.vue`
(template lines ~377–452). Four rows become three:

**Row 1 — Header.** A flex row: the existing Overview button (icon + label,
active/inactive states unchanged) on the left taking the remaining width; the
two existing `SIconButton`s (Clone Repository, Global Configuration) on the
right. Buttons keep their tooltips, handlers, sizes, and `:active` binding.

**Row 2 — Tab switcher.** The existing segmented control with sliding pill,
unchanged in mechanism. Each tab label gains a trailing count chip:

- Repositories → `repositories.length`
- Recent → `recentWorktrees.length`
- Chip style: `rounded-full px-1.5 text-[10px] tabular-nums`.
  Active tab: `bg-accent/20 text-accent`. Inactive tab: `bg-white/[0.08]
  text-text-muted`. Uses existing design tokens; no new colours.

**Row 3 — Search.** The existing `SearchInput`, with horizontal inset
adjusted so its left edge aligns with the Overview button and tab control
above (currently `px-1.5` vs `px-2.5` elsewhere).

**Removed.** The summary row (`flex items-center justify-between px-2.5 py-2`)
containing the repos/worktrees counts, the "{n} recent" label, and the two
icon buttons. Nothing else about the recent tab list or repo list changes.

## Behaviour

**Recent count on launch.** `fetchRecentWorktrees()` currently runs only when
the Recent tab is activated (and on mount only if the persisted tab is
already `recent`). With an always-visible Recent chip this would show a
misleading `0` until first visit. Change `onMounted` to fetch recent
worktrees unconditionally — one cheap `wt recent` sidecar call. The
fetch-on-tab-switch behaviour stays (keeps the list fresh).

**Empty states.** With zero repositories the chip shows `0`; the search input
remains hidden (existing `v-if`). No other empty-state changes.

## Out of Scope

- Search input visual redesign (kept as-is)
- Repo list rows, recent list rows, empty states
- Overview page stat strip (already shows portfolio totals)
- Light theme work beyond what the shared tokens give for free

## Testing

- Update `RepoList.test.ts`: it currently asserts the old stats text
  ("repos ·"). Replace with assertions that
  (a) both tabs render their count chips with correct values,
  (b) the clone/config buttons render in the header row and still fire their
  handlers, (c) the stats row is gone,
  (d) recent worktrees are fetched on mount regardless of active tab.
- Gates: `npx vitest run` and `npm run build` (vue-tsc) both clean.

## Reference

Mockups from the brainstorm session live in
`.superpowers/brainstorm/5918-1780746194/content/` (gitignored): the chosen
direction is `header-direction.html` option B with the `both-tabs` variant
from `chip-variants.html`.
