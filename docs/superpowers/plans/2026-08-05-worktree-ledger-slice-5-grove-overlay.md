# Worktree Ledger Overlay (Slice 5, Grove desktop half) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the Worktree Ledger overlay (already emitted by `grove ls --json`) in Grove desktop — risk/checkpoint/next-action badges, a details section, honest removal-blocked errors with remedies, a "record a checkpoint first" action, and an attention group — without Grove ever deciding what is risky.

**Architecture:** Grove desktop is a thin consumer. The grove CLI sidecar already appends an optional nested `ledger` object to each `grove ls --json` row (produced by `way worktree resume`); this plan adds the Rust/TS types to carry it, Vue components to render it, and one new Tauri command that shells out to the `way` binary for an objective-only checkpoint. No second reducer, no Markdown parsing, no risk computation in Grove, no UI path that bypasses the CLI's removal gate.

**Tech Stack:** Tauri 2 (Rust), Vue 3 `<script setup>` + TypeScript strict, Pinia, Tailwind + `@stuntrocket/ui` (`SBadge`), Vitest + happy-dom (Tauri fully mocked in `src/test/setup.ts`).

## Global Constraints

- `available: false` renders as **unknown, never as safe**; an absent `ledger` key renders **nothing** (today's UI, unchanged). "No gate ran" and "the gate passed" must never look alike.
- Grove never decides what is risky, never parses ledger Markdown, never re-implements a ledger rule. It relays `way`'s answers verbatim — the remedies matter.
- No UI control may bypass or acknowledge the removal gate. No override button. `-f` is not ledger consent.
- Types in `src-tauri/src/types.rs` and `src/types/wt.ts` mirror each other — every type change lands in both.
- Tests never invoke the real `way` or `clio`. Rust tests use an explicit stub binary path; Vitest uses the existing Tauri mocks.
- British English in all user-facing copy. Badges/tooltips follow the existing `WorktreeStatusBadges.vue` pattern (`SBadge`, `role="status"`, `aria-label`, `title`).
- Conventional commit messages; never mention AI or Claude.
- Gates (run from repo root; PATH needs Herd node: `export PATH="$HOME/Library/Application Support/Herd/config/nvm/versions/node/v22.23.2/bin:$PATH"`): `npm run build`, `npm test`, `cd src-tauri && cargo test && cargo fmt --check && cargo clippy --all-targets`.
- Baseline before this plan: 354 vitest tests green.

**Overlay contract** (producer: `grove-cli/lib/13-ledger.sh` `ledger_overlay_json()`, relayed verbatim — do not reshape):

```json
{ "available": true,
  "worktree_id": "wt_…",        "workstream_id": null,
  "risk": null,                  "checkpoint_at": "2026-08-05T17:00:00Z",
  "next_action": "…",           "narrative_status": "present",
  "drift": false,                "unavailable_reason": null }
```

`risk` is deliberately `null` from `resume` (only `removal-check` computes risk); render it when present (`"critical" | "warning" | "informational"`) but never derive it. On failure the object is `{"available": false, "unavailable_reason": "…"}`. The key is omitted entirely when the integration is off or `way` is absent.

---

### Task 1: `LedgerOverlay` types, mirrored Rust ↔ TS

**Files:**
- Modify: `src-tauri/src/types.rs` (after the `Worktree` struct, ~line 120)
- Modify: `src/types/wt.ts` (after the `Worktree` interface, ~line 83)
- Test: `src-tauri/src/types.rs` (inline `#[cfg(test)]` additions), `src/types/wt.test.ts`

**Interfaces:**
- Produces: Rust `LedgerOverlay` struct + `Worktree.ledger: Option<LedgerOverlay>`; TS `LedgerOverlay` interface + `Worktree.ledger?: LedgerOverlay`. All later tasks consume these exact names.

- [ ] **Step 1: Write the failing Rust test** (in the existing `#[cfg(test)] mod tests` in `types.rs`)

```rust
#[test]
fn worktree_row_without_ledger_key_deserialises_to_none() {
    let row = r#"{"branch":"develop","path":"/tmp/x","sha":"abc1234","dirty":false,
        "changes":0,"ahead":0,"behind":0,"stale":false,"age":"1d","age_days":1,"merged":false}"#;
    let wt: Worktree = serde_json::from_str(row).expect("row should parse");
    assert!(wt.ledger.is_none());
}

#[test]
fn ledger_overlay_unavailable_carries_reason() {
    let row = r#"{"branch":"b","path":"/tmp/x","sha":"abc1234","dirty":false,
        "ahead":null,"behind":null,
        "ledger":{"available":false,"unavailable_reason":"way exited 3"}}"#;
    let wt: Worktree = serde_json::from_str(row).expect("row should parse");
    let ledger = wt.ledger.expect("ledger key present");
    assert!(!ledger.available);
    assert_eq!(ledger.unavailable_reason.as_deref(), Some("way exited 3"));
    assert!(ledger.risk.is_none());
}

#[test]
fn ledger_overlay_full_row_parses() {
    let row = r#"{"branch":"b","path":"/tmp/x","sha":"abc1234","dirty":true,
        "ahead":1,"behind":0,
        "ledger":{"available":true,"worktree_id":"wt_1","workstream_id":null,
                  "risk":"critical","checkpoint_at":"2026-08-05T17:00:00Z",
                  "next_action":"merge to develop","narrative_status":"present",
                  "drift":true,"unavailable_reason":null}}"#;
    let wt: Worktree = serde_json::from_str(row).expect("row should parse");
    let ledger = wt.ledger.expect("ledger key present");
    assert!(ledger.available);
    assert_eq!(ledger.risk.as_deref(), Some("critical"));
    assert_eq!(ledger.drift, Some(true));
}
```

- [ ] **Step 2: Run to verify failure** — `cd src-tauri && cargo test worktree_row_without_ledger` — expected: compile error, `ledger` field does not exist.

- [ ] **Step 3: Implement the Rust types** in `types.rs`, directly after the `Worktree` struct:

```rust
/// Worktree Ledger overlay relayed verbatim from `grove ls --json` (optional, additive).
///
/// `available: false` is NOT "nothing at risk" — it carries `unavailable_reason`
/// and must render as "unknown", never as safe. An absent `ledger` key on a row
/// means the integration is off or `way` was not found: render nothing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerOverlay {
    /// Whether the ledger answered for this worktree
    pub available: bool,
    /// Ledger identity of the worktree (e.g. "wt_…")
    #[serde(default)]
    pub worktree_id: Option<String>,
    /// Workstream the worktree belongs to, when recorded
    #[serde(default)]
    pub workstream_id: Option<String>,
    /// "critical" | "warning" | "informational" when populated by removal-check;
    /// deliberately null from `resume` — Grove never guesses risk
    #[serde(default)]
    pub risk: Option<String>,
    /// ISO timestamp of the last recorded checkpoint, null when never checkpointed
    #[serde(default)]
    pub checkpoint_at: Option<String>,
    /// The recorded next action for this worktree
    #[serde(default)]
    pub next_action: Option<String>,
    /// "present" | "missing"
    #[serde(default)]
    pub narrative_status: Option<String>,
    /// True when state has drifted since the last checkpoint
    #[serde(default)]
    pub drift: Option<bool>,
    /// Why the ledger could not answer, when available is false
    #[serde(default)]
    pub unavailable_reason: Option<String>,
}
```

and add to `Worktree` (after the `stale` field):

```rust
    /// Worktree Ledger overlay (optional; see LedgerOverlay)
    #[serde(default)]
    pub ledger: Option<LedgerOverlay>,
```

- [ ] **Step 4: Run to verify pass** — `cargo test types::` (all three new tests PASS, existing tests stay green).

- [ ] **Step 5: Write the failing TS test** in `src/types/wt.test.ts`, following that file's existing structural style:

```ts
import type { Worktree, LedgerOverlay } from './wt'

describe('LedgerOverlay', () => {
  it('is optional on Worktree and carries the overlay contract fields', () => {
    const unavailable: LedgerOverlay = { available: false, unavailable_reason: 'way exited 3' }
    const full: LedgerOverlay = {
      available: true, worktree_id: 'wt_1', workstream_id: null, risk: 'critical',
      checkpoint_at: '2026-08-05T17:00:00Z', next_action: 'merge to develop',
      narrative_status: 'present', drift: true, unavailable_reason: null,
    }
    const bare: Worktree = { path: '/tmp/x', branch: 'b', sha: 'abc', dirty: false, ahead: 0, behind: 0 }
    const withLedger: Worktree = { ...bare, ledger: full }
    expect(bare.ledger).toBeUndefined()
    expect(withLedger.ledger?.risk).toBe('critical')
    expect(unavailable.available).toBe(false)
  })
})
```

- [ ] **Step 6: Run to verify failure** — `npm test -- src/types/wt.test.ts` — expected: TS error, `LedgerOverlay` not exported.

- [ ] **Step 7: Implement the TS mirror** in `src/types/wt.ts` after the `Worktree` interface:

```ts
/**
 * Worktree Ledger overlay relayed verbatim from `grove ls --json` (optional, additive).
 *
 * `available: false` is NOT "nothing at risk" — it carries `unavailable_reason`
 * and must render as "unknown", never as safe. An absent `ledger` key means the
 * integration is off or `way` was not found: render nothing.
 */
export interface LedgerOverlay {
  /** Whether the ledger answered for this worktree */
  available: boolean
  /** Ledger identity of the worktree (e.g. "wt_…") */
  worktree_id?: string | null
  /** Workstream the worktree belongs to, when recorded */
  workstream_id?: string | null
  /** "critical" | "warning" | "informational" when populated by removal-check; null from resume */
  risk?: 'critical' | 'warning' | 'informational' | null
  /** ISO timestamp of the last recorded checkpoint, null when never checkpointed */
  checkpoint_at?: string | null
  /** The recorded next action for this worktree */
  next_action?: string | null
  /** "present" | "missing" */
  narrative_status?: 'present' | 'missing' | null
  /** True when state has drifted since the last checkpoint */
  drift?: boolean | null
  /** Why the ledger could not answer, when available is false */
  unavailable_reason?: string | null
}
```

and on `Worktree`:

```ts
  /** Worktree Ledger overlay (optional; see LedgerOverlay) */
  ledger?: LedgerOverlay
```

- [ ] **Step 8: Run to verify pass** — `npm test -- src/types/wt.test.ts` then `npm run build` (vue-tsc clean).

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/types.rs src/types/wt.ts src/types/wt.test.ts
git commit -m "feat(types): carry the worktree ledger overlay on ls rows"
```

---

### Task 2: Ledger badges on worktree rows

**Files:**
- Modify: `src/components/WorktreeStatusBadges.vue`
- Modify: `src/components/WorktreeCard.vue:429` (pass the new prop)
- Test: create `src/components/WorktreeStatusBadges.test.ts`

**Interfaces:**
- Consumes: `LedgerOverlay` from Task 1.
- Produces: `WorktreeStatusBadges` accepts `ledger?: LedgerOverlay`; badge precedence documented below (Task 3+ rely on the same wording).

Badge rules, in display order after the existing badges. At most one of {risk, drift, no-checkpoint} shows (first match wins — risk beats drift beats no-checkpoint); the "unknown" badge is exclusive of the other three:

| Condition | Badge text | SBadge variant | Tooltip (`title`) |
|---|---|---|---|
| `ledger.available === false` | `Ledger unknown` | `default` | `The worktree ledger could not answer for this worktree — its safety is unknown, not clear. ` + `unavailable_reason` when present |
| `available && risk === 'critical'` | `Risk: critical` | `error` | `The worktree ledger reports a critical risk. Open the details panel for the remedy.` |
| `available && risk === 'warning'` | `Risk: warning` | `warning` | `The worktree ledger reports a warning. Open the details panel for the remedy.` |
| `available && risk === 'informational'` | `Risk: note` | `default` | `The worktree ledger has an informational note for this worktree.` |
| `available && !risk && drift === true` | `Drifted` | `warning` | `This worktree's state has changed since its last recorded checkpoint.` |
| `available && !risk && drift !== true && checkpoint_at == null` | `No checkpoint` | `warning` | `This worktree has never been checkpointed in the worktree ledger.` |
| `ledger === undefined` | *(nothing — today's UI, unchanged)* | | |

- [ ] **Step 1: Write the failing test** — create `src/components/WorktreeStatusBadges.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WorktreeStatusBadges from './WorktreeStatusBadges.vue'
import type { LedgerOverlay } from '../types/wt'

const available = (extra: Partial<LedgerOverlay> = {}): LedgerOverlay => ({
  available: true, worktree_id: 'wt_1', risk: null, checkpoint_at: '2026-08-05T17:00:00Z',
  next_action: null, narrative_status: 'present', drift: false, unavailable_reason: null, ...extra,
})

describe('WorktreeStatusBadges — ledger overlay', () => {
  it('renders nothing ledger-related when the overlay is absent', () => {
    const wrapper = mount(WorktreeStatusBadges, { props: { merged: true } })
    expect(wrapper.text()).not.toContain('Ledger')
    expect(wrapper.text()).not.toContain('Risk')
  })

  it('renders "Ledger unknown" (never safe) when available is false', () => {
    const wrapper = mount(WorktreeStatusBadges, {
      props: { ledger: { available: false, unavailable_reason: 'way exited 3' } },
    })
    expect(wrapper.text()).toContain('Ledger unknown')
    const badge = wrapper.get('[aria-label="Ledger status unknown"]')
    expect(badge.attributes('title')).toContain('way exited 3')
    expect(badge.attributes('title')).toContain('unknown, not clear')
  })

  it('renders risk when populated, and risk beats drift', () => {
    const wrapper = mount(WorktreeStatusBadges, {
      props: { ledger: available({ risk: 'critical', drift: true }) },
    })
    expect(wrapper.text()).toContain('Risk: critical')
    expect(wrapper.text()).not.toContain('Drifted')
  })

  it('renders Drifted when state moved since the last checkpoint', () => {
    const wrapper = mount(WorktreeStatusBadges, { props: { ledger: available({ drift: true }) } })
    expect(wrapper.text()).toContain('Drifted')
  })

  it('renders No checkpoint when never checkpointed', () => {
    const wrapper = mount(WorktreeStatusBadges, {
      props: { ledger: available({ checkpoint_at: null }) },
    })
    expect(wrapper.text()).toContain('No checkpoint')
  })

  it('renders no ledger badge for a clean, checkpointed, risk-free worktree', () => {
    const wrapper = mount(WorktreeStatusBadges, { props: { ledger: available() } })
    expect(wrapper.text()).not.toContain('Ledger')
    expect(wrapper.text()).not.toContain('Drifted')
  })

  it('keeps existing badges working alongside ledger badges', () => {
    const wrapper = mount(WorktreeStatusBadges, {
      props: { merged: false, ledger: available({ drift: true }) },
    })
    expect(wrapper.text()).toContain('Unmerged')
    expect(wrapper.text()).toContain('Drifted')
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npm test -- src/components/WorktreeStatusBadges.test.ts` — the ledger cases FAIL (absent-overlay and existing-badge cases may already pass; that is fine).

- [ ] **Step 3: Implement** in `WorktreeStatusBadges.vue`. Add to the props block:

```ts
import type { LedgerOverlay } from '../types/wt'
// … existing props, then:
  /** Worktree Ledger overlay; absent = integration off, render nothing */
  ledger?: LedgerOverlay
```

Add computeds (after the existing ones):

```ts
const ledgerUnknown = computed(() => props.ledger?.available === false)
const ledgerRisk = computed(() => (props.ledger?.available ? props.ledger.risk ?? null : null))
const showDrift = computed(
  () => props.ledger?.available === true && !ledgerRisk.value && props.ledger.drift === true
)
const showNoCheckpoint = computed(
  () =>
    props.ledger?.available === true &&
    !ledgerRisk.value &&
    props.ledger.drift !== true &&
    props.ledger.checkpoint_at == null
)
const ledgerUnknownTitle = computed(() => {
  const base = 'The worktree ledger could not answer for this worktree — its safety is unknown, not clear.'
  const reason = props.ledger?.unavailable_reason
  return reason ? `${base} ${reason}` : base
})
```

Include the new states in `hasAnyBadge`, and append four `SBadge` blocks to the template following the exact structure of the existing ones (same classes, `role="status"`; `aria-label`s: `Ledger status unknown`, `Ledger risk: {{ ledgerRisk }}`, `Drifted since last checkpoint`, `Never checkpointed`; icon: reuse the clock SVG path for drift/no-checkpoint and the warning-triangle path for risk/unknown — copy the `<svg>` blocks already in the file).

- [ ] **Step 4: Run to verify pass** — `npm test -- src/components/WorktreeStatusBadges.test.ts`.

- [ ] **Step 5: Pass the prop from the card** — `WorktreeCard.vue:429`:

```vue
<WorktreeStatusBadges :merged="worktree.merged" :stale="worktree.stale" :mismatch="hasMismatch" :ledger="worktree.ledger" />
```

- [ ] **Step 6: Full check** — `npm test` and `npm run build`. Expected: all green (354 + new).

- [ ] **Step 7: Commit**

```bash
git add src/components/WorktreeStatusBadges.vue src/components/WorktreeStatusBadges.test.ts src/components/WorktreeCard.vue
git commit -m "feat(ui): ledger risk, drift and unknown badges on worktree rows"
```

---

### Task 3: Ledger section in the details panel

**Files:**
- Modify: `src/components/WorktreeDetailsPanel.vue`
- Test: extend `src/components/WorktreeDetailsPanel.test.ts`

**Interfaces:**
- Consumes: `worktree.ledger` (`LedgerOverlay`) from Task 1.

Read `WorktreeDetailsPanel.vue` and its test first; copy the panel's existing section/row markup exactly (headings, spacing, dt/dd or label/value classes) so the new section is indistinguishable in style.

Section behaviour:
- No `ledger` key → no section at all.
- `available === false` → section titled `Worktree ledger` containing exactly: `The ledger could not answer for this worktree — its safety is unknown.` plus the `unavailable_reason` on the next line in dim text.
- `available === true` → rows (omit a row when its value is null): **Workstream** (`workstream_id`), **Last checkpoint** (`checkpoint_at` formatted with the same relative-time helper the panel already uses for dates; if it uses none, use `useRelativeTime` from `src/composables/useRelativeTime.ts`), **Next action** (`next_action`), **Narrative** (`present` → `Recorded`, `missing` → `Missing`), **Drift** (`drift === true` → `State has changed since the last checkpoint`, else `In step with the last checkpoint`), **Risk** (only when non-null: the value plus `— see removal check for the remedy`).
- Footer line in dim text: `Recorded facts, as at the last list refresh.`

- [ ] **Step 1: Write the failing tests** in `WorktreeDetailsPanel.test.ts` (follow the file's existing mount/props pattern — reuse its worktree fixture factory, adding `ledger`):

```ts
it('shows no ledger section when the overlay is absent', () => {
  // mount with the file's standard worktree fixture (no ledger key)
  expect(wrapper.text()).not.toContain('Worktree ledger')
})

it('renders the unknown state honestly, never as safe', () => {
  // fixture with ledger: { available: false, unavailable_reason: 'way exited 3' }
  expect(wrapper.text()).toContain('its safety is unknown')
  expect(wrapper.text()).toContain('way exited 3')
})

it('renders checkpoint, next action, drift and workstream rows when available', () => {
  // fixture with ledger: { available: true, workstream_id: 'ws_1', checkpoint_at: <iso>,
  //   next_action: 'merge to develop', narrative_status: 'present', drift: true }
  expect(wrapper.text()).toContain('merge to develop')
  expect(wrapper.text()).toContain('State has changed since the last checkpoint')
  expect(wrapper.text()).toContain('ws_1')
})
```

- [ ] **Step 2: Run to verify failure** — `npm test -- src/components/WorktreeDetailsPanel.test.ts`.

- [ ] **Step 3: Implement the section** per the behaviour table, copying the panel's existing markup idioms.

- [ ] **Step 4: Run to verify pass**, then `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/components/WorktreeDetailsPanel.vue src/components/WorktreeDetailsPanel.test.ts
git commit -m "feat(ui): worktree ledger section in the details panel"
```

---

### Task 4: `LEDGER_BLOCKED` errors carry way's remedies (Rust)

**Files:**
- Modify: `src-tauri/src/wt.rs` (`execute_wt_with_stderr` failure branch)
- Test: inline in `wt.rs` tests module (near `test_parse_remove_worktree_result_cli_contract`, ~line 2597)

**Interfaces:**
- Produces: `WtError { code: "LEDGER_BLOCKED", message }` where `message` begins with `way`'s verbatim risk/remedy text (from stderr) followed by the CLI's instruction line. Task 5 renders this message.

Background: when the ledger blocks `grove rm`, the CLI prints `way`'s explanation (risks + remedies, verbatim) to **stderr**, then exits 6 with `{"success":false,"error":{"code":"LEDGER_BLOCKED","message":"removal blocked by the worktree ledger (see above)…"}}` on stdout. The current failure branch keeps only the stdout message — the remedies are lost. Surfacing them is the spec's "surface removal failures and the exact remediation".

- [ ] **Step 1: Extract a testable seam.** In `wt.rs`, add a free function and rewrite the structured-error branch of `execute_wt_with_stderr` to call it:

```rust
/// Build the WtError for a failed CLI call from its structured stdout error,
/// attaching stderr detail for ledger blocks: `way` prints each risk and its
/// remedy to stderr, and a gate that blocks without saying how to proceed is
/// exactly what teaches people to reach for -f.
fn structured_cli_error(stdout: &str, stderr: &str) -> Option<WtError> {
    let cli_error = extract_json_object::<CliErrorResponse>(stdout).ok()?;
    let mut message = sanitise_error_message(&cli_error.error.message);
    if cli_error.error.code == "LEDGER_BLOCKED" {
        let detail = sanitise_error_message(stderr.trim());
        if !detail.is_empty() {
            message = format!("{}\n\n{}", detail, message);
        }
    }
    Some(WtError::new(&cli_error.error.code, message))
}
```

In `execute_wt_with_stderr`'s `!success` branch, replace the existing `if let Ok(cli_error) = extract_json_object…{…}` block with:

```rust
        if let Some(err) = structured_cli_error(&stdout_str, &String::from_utf8_lossy(&output.stderr)) {
            return Err(err);
        }
```

Leave `execute_wt` untouched — the ledger gate only fires on the removal path, which uses `execute_wt_with_stderr`.

- [ ] **Step 2: Write the failing tests** (they fail to compile until Step 1 exists; write them first, watch them fail, then apply Step 1 — TDD order):

```rust
#[test]
fn ledger_blocked_error_carries_stderr_remedies_first() {
    let stdout = r#"{"success": false, "error": {"code": "LEDGER_BLOCKED", "message": "removal blocked by the worktree ledger (see above). To proceed, run 'way worktree removal-check --acknowledge' in the worktree and pass the token with --ledger-ack"}}"#;
    let stderr = "critical: uncommitted changes (3 files)\n  remedy: commit or stash them\nwarning: 2 unpushed commits\n  remedy: git push";
    let err = structured_cli_error(stdout, stderr).expect("structured error expected");
    assert_eq!(err.code, "LEDGER_BLOCKED");
    assert!(err.message.starts_with("critical: uncommitted changes"));
    assert!(err.message.contains("remedy: git push"));
    assert!(err.message.contains("removal blocked by the worktree ledger"));
}

#[test]
fn non_ledger_errors_do_not_gain_stderr() {
    let stdout = r#"{"success": false, "error": {"code": "PROTECTED_BRANCH", "message": "branch 'main' is protected"}}"#;
    let err = structured_cli_error(stdout, "some unrelated stderr noise").expect("structured error expected");
    assert_eq!(err.code, "PROTECTED_BRANCH");
    assert!(!err.message.contains("unrelated stderr noise"));
}

#[test]
fn unstructured_stdout_yields_none() {
    assert!(structured_cli_error("not json at all", "stderr").is_none());
}
```

- [ ] **Step 3: Run to verify failure** — `cargo test structured_cli_error ledger_blocked` (compile failure first, then red).

- [ ] **Step 4: Apply Step 1, run to verify pass** — `cargo test` in `src-tauri` (full suite stays green).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/wt.rs
git commit -m "feat(rm): surface way's risks and remedies on ledger-blocked removals"
```

---

### Task 5: Delete dialogue — honest block, no bypass, "record a checkpoint first"

**Files:**
- Modify: `src/components/DeleteWorktreeDialog.vue`
- Test: create `src/components/DeleteWorktreeDialog.test.ts`

**Interfaces:**
- Consumes: `WtError`-shaped rejections from `removeWorktree` (Task 4's message format); `worktree.ledger` (Task 1); `ledgerCheckpoint(path)` from Task 6 (write the call now; Task 6 provides it — if executing strictly in order, implement Task 6 before this task's Step 5, or accept the red test until Task 6 lands).
- Produces: dialogue behaviour that Task 6's command is invoked with the worktree's `path`.

Read `DeleteWorktreeDialog.vue` fully first (it holds `error = ref<string | null>`; the catch does `e instanceof Error ? e.message : 'Failed to delete worktree'`). A Tauri command rejection arrives as the serialised `WtError` **object** (`{ code, message }`), not an `Error` — which is why today the dialogue would show the generic string. Fix that as part of this task.

Behaviour:
1. Track `errorCode = ref<string | null>(null)`. In the catch: if `e` is an object with string `code` and `message`, set both refs from it; else fall back to existing handling.
2. When `errorCode === 'LEDGER_BLOCKED'`: render a distinct panel (reuse the existing error panel markup at ~line 330, but titled `The worktree ledger blocked this removal`) with the full message in a `whitespace-pre-wrap` block — the remedies are in it verbatim. **No acknowledge/override control of any kind.** The plain-English line under the message: `Nothing has been deleted. Deal with the risks above, then try again.`
3. When the target `worktree.ledger?.available === false`: show a dim note in the dialogue body (before confirm): `The worktree ledger could not answer for this worktree — this removal will not be safety-checked.` (Absent `ledger` key: no note.)
4. Add a secondary button `Record a checkpoint first` (visible whenever `worktree.ledger?.available === true`), which calls `ledgerCheckpoint(worktree.path)` (Task 6), disables while running, then toasts `Checkpoint recorded` on success or the error message on failure. It does not close the dialogue and does not retry the delete — the human retries deliberately. A checkpoint records state; it never unblocks a dirty tree, so the copy must not promise that.

- [ ] **Step 1: Write the failing tests** — create `src/components/DeleteWorktreeDialog.test.ts`, following `BatchDeleteDialog.test.ts` for the mount/mocking pattern (Tauri `invoke` is mocked globally in `src/test/setup.ts`; mock `useWorktrees().removeWorktree` to reject with `{ code: 'LEDGER_BLOCKED', message: 'critical: …\n  remedy: …\n\nremoval blocked by the worktree ledger…' }`). Cases:

```ts
it('shows the ledger block with its remedies verbatim and no override control', async () => {
  // trigger delete; await rejection render
  expect(wrapper.text()).toContain('The worktree ledger blocked this removal')
  expect(wrapper.text()).toContain('remedy:')
  expect(wrapper.text()).toContain('Nothing has been deleted')
  // the whole dialogue offers no acknowledge/override path
  expect(wrapper.html()).not.toMatch(/acknowledge|override|--ledger-ack/i)
})

it('marks an unanswerable ledger honestly in the confirm body', () => {
  // worktree fixture with ledger: { available: false, unavailable_reason: 'way exited 3' }
  expect(wrapper.text()).toContain('will not be safety-checked')
})

it('offers "Record a checkpoint first" only when the ledger is available, and invokes it', async () => {
  // worktree fixture with ledger available; click the button; assert the mocked
  // ledgerCheckpoint / invoke('ledger_checkpoint') was called with the worktree path
})

it('shows no ledger note when the overlay is absent', () => {
  expect(wrapper.text()).not.toContain('safety-checked')
})
```

- [ ] **Step 2: Run to verify failure** — `npm test -- src/components/DeleteWorktreeDialog.test.ts`.

- [ ] **Step 3: Implement** per the behaviour list.

- [ ] **Step 4: Run to verify pass**, then `npm test` (full) and `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/components/DeleteWorktreeDialog.vue src/components/DeleteWorktreeDialog.test.ts
git commit -m "feat(rm): honest ledger-blocked dialogue with remedies and checkpoint action"
```

---

### Task 6: `way` checkpoint plumbing (Rust command + TS wrapper)

**Files:**
- Create: `src-tauri/src/way.rs`
- Modify: `src-tauri/src/lib.rs` (module + `invoke_handler` registration), `src-tauri/src/commands.rs` (one command), `src/composables/useWt.ts` (wrapper)
- Test: inline in `way.rs`; extend `src/composables/useWt.test.ts`

**Interfaces:**
- Produces: Tauri command `ledger_checkpoint(path: String) -> Result<String, WtError>`; TS `ledgerCheckpoint(path: string): Promise<string>` in `useWt.ts`. Task 5 consumes both.

Design notes for the implementer:
- GUI-launched apps do not inherit the shell `PATH` — probe explicit locations, exactly as the grove CLI's `way_binary()` does. `GROVE_WAY_BIN` wins when set (also the test seam).
- This is the only place Grove desktop runs `way`. Checkpoint is `--objective-only`: it records observed state, no narrative arguments, nothing destructive.
- Use `std::process::Command` (the `gh` pattern at `commands.rs:1335`), not the sidecar API.

- [ ] **Step 1: Write the failing tests** in `way.rs` (file starts as tests + skeleton):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn stub(dir: &std::path::Path, exit: i32, out: &str) -> std::path::PathBuf {
        let path = dir.join("way-stub");
        let mut f = std::fs::File::create(&path).unwrap();
        writeln!(f, "#!/bin/sh\necho '{}'\nexit {}", out, exit).unwrap();
        let mut perms = std::fs::metadata(&path).unwrap().permissions();
        use std::os::unix::fs::PermissionsExt;
        perms.set_mode(0o755);
        std::fs::set_permissions(&path, perms).unwrap();
        path
    }

    #[test]
    fn checkpoint_succeeds_against_a_zero_exit_binary() {
        let dir = tempfile::tempdir().unwrap();
        let bin = stub(dir.path(), 0, "checkpointed wt_1");
        let result = checkpoint_with_binary(&bin, dir.path()).expect("checkpoint should succeed");
        assert!(result.contains("checkpointed wt_1"));
    }

    #[test]
    fn checkpoint_failure_is_a_typed_error_with_the_output() {
        let dir = tempfile::tempdir().unwrap();
        let bin = stub(dir.path(), 1, "no ledger root configured");
        let err = checkpoint_with_binary(&bin, dir.path()).expect_err("non-zero exit must error");
        assert_eq!(err.code, "WAY_CHECKPOINT_FAILED");
        assert!(err.message.contains("no ledger root configured"));
    }

    #[test]
    fn missing_binary_is_way_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let err = checkpoint_with_binary(std::path::Path::new("/nonexistent/way"), dir.path())
            .expect_err("missing binary must error");
        assert_eq!(err.code, "WAY_NOT_FOUND");
    }
}
```

(`tempfile` is already a dev-dependency of Tauri projects; if absent in `src-tauri/Cargo.toml` dev-dependencies, add `tempfile = "3"`.)

- [ ] **Step 2: Run to verify failure** — `cargo test way::` — compile failure.

- [ ] **Step 3: Implement `way.rs`:**

```rust
//! The single seam to Waypoint's `way` CLI. Grove desktop never re-implements
//! a ledger rule: it runs `way`, relays the answer, and obeys the exit code.

use crate::types::WtError;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Locate the `way` binary. GUI-launched apps do not inherit the shell PATH,
/// so explicit locations are probed after it, mirroring the grove CLI.
/// `GROVE_WAY_BIN` wins when set (also the hermetic test seam).
fn way_binary() -> Option<PathBuf> {
    if let Ok(explicit) = std::env::var("GROVE_WAY_BIN") {
        let p = PathBuf::from(explicit);
        return p.is_file().then_some(p);
    }
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!("{home}/.local/bin/way"),
        format!("{home}/.cargo/bin/way"),
        "/opt/homebrew/bin/way".to_string(),
        "/usr/local/bin/way".to_string(),
    ];
    if let Ok(output) = Command::new("way").arg("--version").output() {
        if output.status.success() {
            return Some(PathBuf::from("way"));
        }
    }
    candidates.iter().map(PathBuf::from).find(|p| p.is_file())
}

/// Record an objective-only checkpoint for the worktree at `path`.
pub fn checkpoint_objective_only(path: &Path) -> Result<String, WtError> {
    let bin = way_binary().ok_or_else(|| WtError::new(
        "WAY_NOT_FOUND",
        "The Waypoint 'way' command was not found. Install Waypoint to record checkpoints.",
    ))?;
    checkpoint_with_binary(&bin, path)
}

fn checkpoint_with_binary(bin: &Path, path: &Path) -> Result<String, WtError> {
    let output = Command::new(bin)
        .args(["worktree", "checkpoint", "--objective-only"])
        .current_dir(path)
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                WtError::new(
                    "WAY_NOT_FOUND",
                    "The Waypoint 'way' command was not found. Install Waypoint to record checkpoints.",
                )
            } else {
                WtError::new("IO_ERROR", format!("Failed to run way: {e}"))
            }
        })?;
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    if output.status.success() {
        Ok(combined.trim().to_string())
    } else {
        Err(WtError::new("WAY_CHECKPOINT_FAILED", combined.trim().to_string()))
    }
}
```

- [ ] **Step 4: Run to verify pass** — `cargo test way::`.

- [ ] **Step 5: Wire the command.** `commands.rs` (validate the path with the same validator the file already uses for path inputs — read a neighbouring path-taking command and copy its validation exactly):

```rust
/// Record an objective-only worktree-ledger checkpoint for a worktree.
/// Callable from frontend as: invoke('ledger_checkpoint', { path })
#[tauri::command]
pub async fn ledger_checkpoint(path: String) -> Result<String, WtError> {
    let validated = crate::fs_safety::validate_path(&path)?; // copy the file's existing idiom
    tauri::async_runtime::spawn_blocking(move || {
        crate::way::checkpoint_objective_only(std::path::Path::new(&validated))
    })
    .await
    .map_err(|e| WtError::new("SPAWN_ERROR", e.to_string()))?
}
```

Register `mod way;` in `lib.rs` and add `commands::ledger_checkpoint` to the `invoke_handler` list. Add to `useWt.ts` (following the file's existing wrapper style):

```ts
  /** Record an objective-only worktree-ledger checkpoint for a worktree */
  async function ledgerCheckpoint(path: string): Promise<string> {
    return await invoke<string>('ledger_checkpoint', { path })
  }
```

and export it from the composable's return object.

- [ ] **Step 6: Extend `useWt.test.ts`** with one case following that file's existing invoke-assertion pattern: `ledgerCheckpoint('/tmp/x')` calls `invoke('ledger_checkpoint', { path: '/tmp/x' })`.

- [ ] **Step 7: Full check** — `cargo test`, `cargo fmt --check`, `cargo clippy --all-targets`, `npm test`, `npm run build`.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/way.rs src-tauri/src/lib.rs src-tauri/src/commands.rs src-tauri/src/Cargo.toml src/composables/useWt.ts src/composables/useWt.test.ts
git commit -m "feat(ledger): objective-only checkpoint command through the way CLI"
```

(If `Cargo.toml` gained no dev-dependency, drop it from the `git add`.)

---

### Task 7: Attention-panel group for ledger drift and risk

**Files:**
- Modify: `src/stores/overview.ts`, `src/components/overview/AttentionPanel.vue`
- Test: extend `src/stores/overview.test.ts`, `src/components/overview/AttentionPanel.test.ts`

**Interfaces:**
- Consumes: `wt.ledger` on snapshot worktrees (Task 1's type flows through `collectWorktrees`).
- Produces: `ledgerAttention` computed on the overview store; a `Ledger` group in the attention panel.

Membership rule (facts only — Grove never computes risk): a worktree belongs when `ledger?.available === true` **and** (`drift === true` **or** `risk === 'critical'`). Never include `available: false` rows — unknown is a badge, not an alarm. Group heading: `Uncheckpointed work`; per-item line: the worktree name plus `Drifted since last checkpoint` or `Critical ledger risk` (risk wins when both).

- [ ] **Step 1: Write the failing store tests** in `overview.test.ts` (reuse the file's snapshot-building helpers; add `ledger` to two fixture worktrees):

```ts
it('collects drifted and critical-risk worktrees into ledgerAttention', () => {
  // snapshot A: worktree with ledger { available: true, drift: true }
  // snapshot B: worktree with ledger { available: true, drift: false, risk: 'critical' }
  // snapshot C: worktree with ledger { available: false } and one with no ledger key
  expect(store.ledgerAttention).toHaveLength(2)
})

it('never treats an unanswerable ledger as attention-worthy', () => {
  // only available:false and absent-key worktrees
  expect(store.ledgerAttention).toHaveLength(0)
})
```

- [ ] **Step 2: Run to verify failure** — `npm test -- src/stores/overview.test.ts`.

- [ ] **Step 3: Implement** in `overview.ts` beside the sibling computeds:

```ts
  const ledgerAttention = computed(() =>
    collectWorktrees(
      (wt) => wt.ledger?.available === true && (wt.ledger.drift === true || wt.ledger.risk === 'critical')
    )
  );
```

Add `ledgerAttention.value.length > 0` to `hasAttentionItems`, and export `ledgerAttention` from the store's return object.

- [ ] **Step 4: Panel rendering.** Read `AttentionPanel.vue`'s existing group markup (the dirty/behind/cleanup groups) and add an `Uncheckpointed work` group rendered identically, driven by `ledgerAttention`, with the per-item reason text as above. Extend `AttentionPanel.test.ts` with one case asserting the group renders its items and one asserting it is absent when `ledgerAttention` is empty.

- [ ] **Step 5: Run to verify pass** — `npm test -- src/stores/overview.test.ts src/components/overview/AttentionPanel.test.ts`, then full `npm test` + `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add src/stores/overview.ts src/stores/overview.test.ts src/components/overview/AttentionPanel.vue src/components/overview/AttentionPanel.test.ts
git commit -m "feat(overview): uncheckpointed-work attention group from the ledger overlay"
```

---

### Task 8: Sidecar refresh path for worktree layouts + docs

**Files:**
- Modify: `scripts/prepare-sidecar.sh` (env override), `docs/developers/sidecar.md` (one paragraph)
- Create: `docs/developers/ledger-overlay.md`

**Interfaces:** none consumed by code; unblocks builds in git worktrees and documents the overlay.

Background: `prepare-sidecar.sh` hardcodes `$PROJECT_ROOT/../grove-cli/grove`, which resolves wrongly from a git worktree (e.g. `.claude/worktrees/<name>/`). The bundled sidecar predating the ledger work is also why the overlay silently never appears — because the field is optional, a stale sidecar fails silently, which is exactly the "no gate ran vs gate passed" confusion the contract warns about.

- [ ] **Step 1:** In `prepare-sidecar.sh`, replace the `GROVE_SOURCE=` line with:

```bash
# Path to the grove CLI. GROVE_CLI_SOURCE overrides the sibling-checkout
# default — needed when building from a git worktree, where ../grove-cli
# does not resolve.
GROVE_SOURCE="${GROVE_CLI_SOURCE:-$PROJECT_ROOT/../grove-cli/grove}"
```

- [ ] **Step 2: Verify** — `GROVE_CLI_SOURCE=/Users/dannyharding/Development/Code/Project/grove-cli/grove ./scripts/prepare-sidecar.sh` succeeds from the worktree and `grep -c ledger_overlay_json src-tauri/binaries/grove-aarch64-apple-darwin` prints ≥ 1.

- [ ] **Step 3: Write `docs/developers/ledger-overlay.md`** — one page: the overlay contract table (copy from this plan's header), the three render states (absent / unavailable / available), the no-bypass rule, `GROVE_WAY_BIN` as the test seam, and the note that badges depend on the **bundled sidecar** carrying `ledger_overlay_json` and the **installed `way`** supporting `worktree resume --format json` — stale binaries degrade honestly to "Ledger unknown". Add one sentence + link in `docs/developers/sidecar.md` about `GROVE_CLI_SOURCE`.

- [ ] **Step 4: Commit**

```bash
git add scripts/prepare-sidecar.sh docs/developers/sidecar.md docs/developers/ledger-overlay.md
git commit -m "docs(ledger): overlay contract and worktree-safe sidecar refresh"
```

---

### Task 9: Full gates

- [ ] **Step 1:** From the repo root, PATH prepended as in Global Constraints: `npm run build` — clean.
- [ ] **Step 2:** `npm test` — 354 baseline + all new tests, 0 failures.
- [ ] **Step 3:** `cd src-tauri && cargo test && cargo fmt --check && cargo clippy --all-targets` — all clean.
- [ ] **Step 4:** Push the branch: `git push -u origin feature/worktree-ledger-slice-5-grove-overlay` (nothing sits unpushed overnight).

## Deliberately out of scope (recorded so nobody "helpfully" adds them)

- **"Open in Waypoint"** — deferred to the Waypoint half of Slice 5: there is no dashboard to open yet. Wire it when the Waypoint Worktrees view exists.
- **Populating `risk` in the overlay** — `resume` does not carry risk and Grove must not guess it; populating it is a `way`/grove-cli change for the Waypoint half or later.
- **Active lease on rows** — the spec's Grove contract lists it, but `ledger_overlay_json` does not emit lease facts yet. Producer-side change (grove-cli + `way`), recorded here so it is deferred, not forgotten. Lease conflicts still surface honestly today: a held worktree fails `checkpoint`/`rm` through `way`, whose verbatim message names the holder.
- **Park/archive actions in Grove desktop** — the spec allows them, but they are Waypoint-dashboard actions first; revisit after the Waypoint half ships.
- **Any acknowledge/override UI** — never. CLI only, by design.
