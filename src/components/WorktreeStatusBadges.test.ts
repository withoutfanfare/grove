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
