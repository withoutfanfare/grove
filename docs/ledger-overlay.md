# Worktree Ledger Overlay

The Worktree Ledger overlay surfaces risk, checkpoint and next-action information — already computed by the `way` CLI — on top of Grove's worktree rows. Grove never computes or guesses any of this itself; it relays what `way` says, verbatim.

## Overlay contract

The overlay is an optional, additive field on each `grove ls --json` row, produced by `grove-cli/lib/13-ledger.sh`'s `ledger_overlay_json()`. Grove relays it as-is — it does not reshape it.

```json
{ "available": true,
  "worktree_id": "wt_…",         "workstream_id": null,
  "risk": "critical",            "risk_available": true,
  "risk_unavailable_reason": null, "removal_blocked": true,
  "lease_available": true,       "lease_unavailable_reason": null,
  "lease_held": true,
  "lease": { "tool": "claude", "session_id": "…", "machine_id": "machine_…",
             "acquired_at": "…", "last_heartbeat_at": "…", "expires_at": "…" },
  "checkpoint_at": "2026-08-05T17:00:00Z",
  "next_action": "…",            "narrative_status": "present",
  "drift": false,                 "unavailable_reason": null }
```

Building one overlay runs three `way` commands concurrently, because no single command answers everything: `resume` (identity, checkpoint, next action, drift), `removal-check --json` (`risk`, `removal_blocked`) and `lease status --json` (`lease_held`, `lease`). `resume` is the identity source, so only a failure there makes the whole object unavailable — `{"available": false, "unavailable_reason": "…"}`. The key is omitted entirely when the integration is off or `way` is absent.

Grove renders `risk` (`"critical" | "warning" | "informational"`) but never derives it, and never derives `removal_blocked` from it either — whether a risk blocks removal is the ledger's rule to state.

Those three names are the *service's* vocabulary and never reach a human. Grove shows Waypoint's words for them — "At risk", "Needs a look", "Worth knowing", and "Clear" when the check answered and found nothing — because both apps read the same `removal-check` and must not describe it in two languages. The words live in `src/utils/riskVocabulary.ts`, and `src/components/guards.test.ts` fails if a raw level name reaches user-facing text.

### Null is not "safe" — read the availability flag

`risk` and `lease` are each null in two completely different situations, and the flag beside them is what tells those apart:

| Fields | Means | Grove shows |
|---|---|---|
| `risk_available: true`, `risk: null` | Checked; nothing found | No risk badge (a true claim of "nothing at risk") |
| `risk_available: false` | The check could not answer | A **"Risk unknown"** badge, and the reason in the details panel |
| `lease_available: true`, `lease: null` | Checked; nobody has claimed it | Nothing on the row |
| `lease_available: true`, `lease_held: false`, `lease: {…}` | The claim **expired** | Nothing on the row; the panel names the last holder |
| `lease_available: true`, `lease_held: true` | An agent is working here **now** | A **"<tool> working here"** badge |
| `lease_available: true`, `lease_held` absent, `lease: {…}` | Somebody claimed it; the ledger did not say whether the claim still stands | Nothing on the row; the panel names the holder and says the state was not stated |
| `lease_available: false` | The lease could not be read | Nothing on the row; the panel says "Unknown" and why |

`lease_held` is optional, so the row where it is **absent** matters: an unstated value is not evidence the claim lapsed, and calling it expired would invent a fact the ledger did not give.

Risk-unknown gets a badge and lease-unknown does not, and the asymmetry is deliberate: the **absence** of a risk badge is itself a claim ("nothing at risk"), so an unknown there has to speak up. The absence of a lease badge claims nothing. Both are stated plainly in the details panel, and a risk that could not be established also joins the overview's "Drifted or at risk" group — the one place that aggregates safety must not quietly count an unknown as fine.

Both flags default to **false** when absent, so an older sidecar that does not emit them reads as unknown rather than clear.

## The three render states

| State | Ledger key | What Grove shows |
|---|---|---|
| **Absent** | `ledger` key missing from the row | Nothing — no ledger UI at all. This is today's UI, unchanged; it means the integration is off or `way` was not found. |
| **Unavailable** | `ledger.available === false` | "Ledger unknown" — never rendered as safe, always as unknown. Carries `unavailable_reason` for the tooltip/detail text. |
| **Available** | `ledger.available === true` | The real badges/details: risk (when present), checkpoint age, next action, drift, narrative status. |

These three states must stay visually distinct: no gate ran (absent, no ledger UI), the gate ran but could not answer (unavailable, shown as an explicit "unknown" badge), and the gate ran and answered (available, the facts shown above). Only in that last state is no news actually good news — because the gate said so, not because it stayed silent.

## "Open in Waypoint"

When the overlay carries a `worktree_id`, the worktree's Actions (⋯) menu gains an **Open in Waypoint** entry beside the other "Open in …" items. It opens `waypoint://worktree?worktree_id=<id>` through the `open_in_waypoint` command.

Three things about it are deliberate:

- **The id is validated at the boundary** (`validate_worktree_id`, `src-tauri/src/commands.rs`): `wt_` prefix, ASCII alphanumerics/hyphen/underscore only, length-capped. The id crosses a process boundary into a URL, so it is checked rather than trusted for having come from `way`.
- **It does not reuse `open_in_browser`.** That command permits http and https only, and loosening it so a custom scheme could pass would weaken a check that exists to stop `file://` and `javascript:` URLs.
- **The entry is hidden without a ledger id.** There is no record for Waypoint to show, and guessing a target would open the wrong worktree's record.

The handover is read-only in both directions: Waypoint *displays* the record and has no removal, acknowledge or override control to offer back. Waypoint allowlists its deep-link verbs and rejects unknown ones, so the verb (`worktree`) and the parameter name (`worktree_id`, snake_case like the ids `way` prints) are a contract, not a formatting choice.

## The no-bypass rule

No control in Grove may acknowledge or bypass the ledger's removal gate. There is no override button, and a force-remove flag (`-f`) is never treated as ledger consent. When `way` blocks a removal, Grove shows the blocking message and remedies exactly as `way` returned them, with a "record a checkpoint first" action that shells out to `way` — it does not let the user skip the check from the UI.

While that checkpoint is running, the delete dialogue's Delete, Cancel and checkpoint buttons are all disabled and their handlers refuse to act: the checkpoint writes to the same ledger and worktree a removal would tear down, so the two must never overlap, and closing the dialogue mid-write would leave it running against a worktree the user could then delete from the list behind it.

## Sidecar and binary dependencies

The badges depend on two things being current at once:

1. The **bundled sidecar** (`grove`, copied by `scripts/prepare-sidecar.sh`) must be a build that carries `ledger_overlay_json` in its `grove ls --json` output.
2. The **installed `way`** binary that the sidecar shells out to must support `worktree resume --format json`.

If either is stale or missing, the overlay degrades honestly rather than failing loudly: because the `ledger` field is optional, an old sidecar or a missing `way` simply omits the key, which Grove renders as the **absent** state (no ledger UI at all). A sidecar that is current but hits a `way` error at runtime instead gets the **unavailable** state ("Ledger unknown"). Either way, nothing is ever shown as safe when the gate did not actually run — see [the three render states](#the-three-render-states) above.

This is also why keeping the sidecar current matters beyond a build failure: a stale sidecar does not error, it just silently stops showing the overlay. See the next section for how to refresh it.

## Refreshing the bundled sidecar

`scripts/prepare-sidecar.sh` copies the `grove` CLI binary from `../grove-cli/grove` by default — a sibling checkout next to this repository. That default does not resolve when building from a git worktree (e.g. `.claude/worktrees/<name>/`), where the sibling path is relative to the worktree, not the main checkout — the script would report the CLI as not found even though it exists elsewhere on disk.

Set `GROVE_CLI_SOURCE` to the built `grove` binary's actual path to override it:

```bash
GROVE_CLI_SOURCE=/path/to/grove-cli/grove ./scripts/prepare-sidecar.sh
```

The script's own comment documents this at the point of use (`scripts/prepare-sidecar.sh`, above the `GROVE_SOURCE=` assignment). Refresh the sidecar — and re-run it — any time the ledger overlay unexpectedly stops appearing; see the previous section for why a stale sidecar fails silently rather than erroring.

## Test seam

Rust tests never invoke the real `way` binary. `GROVE_WAY_BIN` (read in `src-tauri/src/way.rs`) overrides the binary lookup and is the hermetic test seam — set it to an explicit stub binary path so tests exercise Grove's handling of `way`'s output without depending on a real installation or its state.

## No override control in the UI

There is deliberately no setting, flag, or button anywhere in Grove to override or silence the ledger overlay. If badges are missing or a removal is blocked, the fix is to update the sidecar and/or `way` (see above) or address whatever `way` is reporting — not to hide the message.
