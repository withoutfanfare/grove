import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WorktreeStatusBadges from './WorktreeStatusBadges.vue'
import type { LedgerOverlay } from '../types/wt'

// A fully answered overlay: the ledger replied, AND both the risk check and the
// lease read succeeded. `risk_available`/`lease_available` are what turn a null
// into "nothing found" rather than "could not tell", so a fixture that omits
// them is an overlay from an older producer — covered separately below.
const available = (extra: Partial<LedgerOverlay> = {}): LedgerOverlay => ({
  available: true, worktree_id: 'wt_1', risk: null, risk_available: true,
  risk_unavailable_reason: null, removal_blocked: false,
  lease_available: true, lease_unavailable_reason: null, lease_held: false, lease: null,
  checkpoint_at: '2026-08-05T17:00:00Z',
  next_action: null, narrative_status: 'present', drift: false, unavailable_reason: null, ...extra,
})

const lease = (tool = 'claude') => ({
  tool, session_id: 's1', machine_id: 'machine_x',
  acquired_at: '2026-08-06T08:00:00Z', last_heartbeat_at: '2026-08-06T08:20:00Z',
  expires_at: '2026-08-06T08:50:00Z',
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
    // The word is Waypoint's, not the service's — see utils/riskVocabulary.
    const wrapper = mount(WorktreeStatusBadges, {
      props: { ledger: available({ risk: 'critical', drift: true }) },
    })
    expect(wrapper.text()).toContain('At risk')
    expect(wrapper.text()).not.toContain('Drifted')
  })

  it('renders each level in the words Waypoint uses', () => {
    const words = { critical: 'At risk', warning: 'Needs a look', informational: 'Worth knowing' } as const
    for (const [level, label] of Object.entries(words)) {
      const wrapper = mount(WorktreeStatusBadges, {
        props: { ledger: available({ risk: level as 'critical' | 'warning' | 'informational' }) },
      })
      expect(wrapper.text()).toContain(label)
      wrapper.unmount()
    }
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

  it('says "Clear" for a clean, checkpointed, risk-free worktree', () => {
    // The check answered and found nothing, so the row says so. Leaving it
    // blank would make the same claim silently, and a silent claim is the one
    // nobody re-reads.
    const wrapper = mount(WorktreeStatusBadges, { props: { ledger: available() } })
    expect(wrapper.text()).toContain('Clear')
    expect(wrapper.text()).not.toContain('Ledger unknown')
    expect(wrapper.text()).not.toContain('Risk unknown')
    expect(wrapper.text()).not.toContain('Drifted')
  })

  it('keeps existing badges working alongside ledger badges', () => {
    const wrapper = mount(WorktreeStatusBadges, {
      props: { merged: false, ledger: available({ drift: true }) },
    })
    expect(wrapper.text()).toContain('Unmerged')
    expect(wrapper.text()).toContain('Drifted')
  })

  it('renders "Risk unknown" when the risk check could not answer', () => {
    // The absence of a risk badge is a positive claim — it reads as "nothing at
    // risk". An unanswered check must therefore say so out loud.
    const wrapper = mount(WorktreeStatusBadges, {
      props: {
        ledger: available({
          risk: null,
          risk_available: false,
          risk_unavailable_reason: 'no worktree ledger root configured',
        }),
      },
    })
    expect(wrapper.text()).toContain('Risk unknown')
    const badge = wrapper.get('[aria-label="Ledger risk unknown"]')
    expect(badge.attributes('title')).toContain('no worktree ledger root configured')
    expect(badge.attributes('title')).toContain('unknown, not clear')
  })

  it('treats an overlay with no risk_available field as unknown, not clear', () => {
    // An older sidecar does not emit the flag. Defaulting it to "answered"
    // would render every such worktree as risk-free.
    const wrapper = mount(WorktreeStatusBadges, {
      props: {
        ledger: {
          available: true, worktree_id: 'wt_1', risk: null,
          checkpoint_at: '2026-08-05T17:00:00Z', drift: false,
        } as LedgerOverlay,
      },
    })
    expect(wrapper.text()).toContain('Risk unknown')
  })

  it('never shows a risk badge and a risk-unknown badge at once', () => {
    const wrapper = mount(WorktreeStatusBadges, {
      props: { ledger: available({ risk: 'critical', removal_blocked: true }) },
    })
    expect(wrapper.text()).toContain('At risk')
    expect(wrapper.text()).not.toContain('Risk unknown')
    expect(wrapper.text()).not.toContain('Clear')
  })

  it('names the agent holding a live lease', () => {
    const wrapper = mount(WorktreeStatusBadges, {
      props: { ledger: available({ lease_held: true, lease: lease('claude') }) },
    })
    expect(wrapper.text()).toContain('claude working here')
    const badge = wrapper.get('[aria-label="An agent is working here: claude"]')
    expect(badge.attributes('title')).toContain('machine_x')
    expect(badge.attributes('title')).toContain('2026-08-06T08:50:00Z')
  })

  it('does not claim an agent is working when the lease has expired', () => {
    const wrapper = mount(WorktreeStatusBadges, {
      props: { ledger: available({ lease_held: false, lease: lease('codex') }) },
    })
    expect(wrapper.text()).not.toContain('working here')
  })

  it('does not claim an agent is working when the lease could not be read', () => {
    // Unknown is not "nobody is here" — but unlike risk, the absence of this
    // badge asserts nothing, so the row stays quiet and the panel says why.
    const wrapper = mount(WorktreeStatusBadges, {
      props: {
        ledger: available({
          lease_available: false,
          lease_unavailable_reason: 'not registered',
          lease_held: null,
          lease: null,
        }),
      },
    })
    expect(wrapper.text()).not.toContain('working here')
  })
})
