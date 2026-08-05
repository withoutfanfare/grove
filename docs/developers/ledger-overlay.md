# Worktree Ledger Overlay

The Worktree Ledger overlay surfaces risk, checkpoint and next-action information — already computed by the `way` CLI — on top of Grove's worktree rows. Grove never computes or guesses any of this itself; it relays what `way` says, verbatim.

## Overlay contract

The overlay is an optional, additive field on each `grove ls --json` row, produced by `grove-cli/lib/13-ledger.sh`'s `ledger_overlay_json()` (which shells out to `way worktree resume`). Grove relays it as-is — it does not reshape it.

```json
{ "available": true,
  "worktree_id": "wt_…",        "workstream_id": null,
  "risk": null,                  "checkpoint_at": "2026-08-05T17:00:00Z",
  "next_action": "…",           "narrative_status": "present",
  "drift": false,                "unavailable_reason": null }
```

`risk` is deliberately `null` from `resume` (only `removal-check` computes risk); Grove renders it when present (`"critical" | "warning" | "informational"`) but never derives it. On failure the object is `{"available": false, "unavailable_reason": "…"}`. The key is omitted entirely when the integration is off or `way` is absent.

## The three render states

| State | Ledger key | What Grove shows |
|---|---|---|
| **Absent** | `ledger` key missing from the row | Nothing — no ledger UI at all. This is today's UI, unchanged; it means the integration is off or `way` was not found. |
| **Unavailable** | `ledger.available === false` | "Ledger unknown" — never rendered as safe, always as unknown. Carries `unavailable_reason` for the tooltip/detail text. |
| **Available** | `ledger.available === true` | The real badges/details: risk (when present), checkpoint age, next action, drift, narrative status. |

"No gate ran" (absent) and "the gate ran and found nothing to say" must never look the same as "the gate passed". That is why *unavailable* renders as an explicit unknown badge rather than being folded into the absent (no-UI) state.

## The no-bypass rule

No control in Grove may acknowledge or bypass the ledger's removal gate. There is no override button, and a force-remove flag (`-f`) is never treated as ledger consent. When `way` blocks a removal, Grove shows the blocking message and remedies exactly as `way` returned them, with a "record a checkpoint first" action that shells out to `way` — it does not let the user skip the check from the UI.

## Sidecar and binary dependencies

The badges depend on two things being current at once:

1. The **bundled sidecar** (`grove`, copied by `scripts/prepare-sidecar.sh`) must be a build that carries `ledger_overlay_json` in its `grove ls --json` output.
2. The **installed `way`** binary that the sidecar shells out to must support `worktree resume --format json`.

If either is stale or missing, the overlay degrades honestly rather than failing loudly: because the `ledger` field is optional, an old sidecar or a missing `way` simply omits the key, which Grove renders as the **absent** state (no ledger UI at all). A sidecar that is current but hits a `way` error at runtime instead gets the **unavailable** state ("Ledger unknown"). Either way, nothing is ever shown as safe when the gate did not actually run — see [the three render states](#the-three-render-states) above.

This is also why keeping the sidecar current matters beyond a build failure: a stale sidecar does not error, it just silently stops showing the overlay. See [Sidecar Bundling](sidecar.md) for the `GROVE_CLI_SOURCE` override that makes rebuilding it work from a git worktree.

## Test seam

Rust tests never invoke the real `way` binary. `GROVE_WAY_BIN` (read in `src-tauri/src/way.rs`) overrides the binary lookup and is the hermetic test seam — set it to an explicit stub binary path so tests exercise Grove's handling of `way`'s output without depending on a real installation or its state.

## No override control in the UI

There is deliberately no setting, flag, or button anywhere in Grove to override or silence the ledger overlay. If badges are missing or a removal is blocked, the fix is to update the sidecar and/or `way` (see above) or address whatever `way` is reporting — not to hide the message.
