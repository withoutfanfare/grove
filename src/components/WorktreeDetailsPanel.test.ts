import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import WorktreeDetailsPanel from './WorktreeDetailsPanel.vue'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'
import type { Worktree } from '@/types'

const worktreeFixture: Worktree = {
  path: '/repos/scooda/2fa-enforce',
  branch: '2fa-enforce',
  sha: '0f60b15',
  dirty: true,
  ahead: 2,
  behind: 0,
}

function mockCommands() {
  mockTauriInvoke.mockImplementation((command: string) => {
    if (command === 'get_recent_commits') {
      return Promise.resolve({
        commits: [
          {
            sha: '0f60b15',
            message: 'docs(2fa): add enforcement implementation plan',
            author: 'Danny Harding',
            date: '2026-06-05T15:20:11+01:00',
          },
        ],
      })
    }
    if (command === 'get_uncommitted_files') {
      return Promise.resolve({
        files: [{ path: 'package-lock.json', status: 'M' }],
      })
    }
    return Promise.resolve(undefined)
  })
}

function detailCalls() {
  return mockTauriInvoke.mock.calls.filter(
    (call) => call[0] === 'get_recent_commits' || call[0] === 'get_uncommitted_files'
  )
}

describe('WorktreeDetailsPanel lazy fetch', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetTauriMocks()
    mockCommands()
  })

  it('fetches commits and files when mounted already expanded', async () => {
    // Regression: cards mounted in a focused+initiallyExpanded state pass
    // isExpanded=true from the first render, so a non-immediate watch never
    // fires and the panel shows empty states despite real data existing.
    const wrapper = mount(WorktreeDetailsPanel, {
      props: { worktree: worktreeFixture, repoName: 'scooda', isExpanded: true },
    })
    await flushPromises()

    expect(detailCalls().map((call) => call[0]).sort()).toEqual([
      'get_recent_commits',
      'get_uncommitted_files',
    ])
    const text = wrapper.text()
    expect(text).toContain('docs(2fa): add enforcement implementation plan')
    expect(text).toContain('package-lock.json')
    expect(text).not.toContain('No commits found')
    expect(text).not.toContain('No uncommitted changes')
    wrapper.unmount()
  })

  it('defers fetching until expanded when mounted collapsed', async () => {
    const wrapper = mount(WorktreeDetailsPanel, {
      props: { worktree: worktreeFixture, repoName: 'scooda', isExpanded: false },
    })
    await flushPromises()

    expect(detailCalls()).toHaveLength(0)

    await wrapper.setProps({ isExpanded: true })
    await flushPromises()

    expect(detailCalls().map((call) => call[0]).sort()).toEqual([
      'get_recent_commits',
      'get_uncommitted_files',
    ])
    wrapper.unmount()
  })
})

describe('WorktreeDetailsPanel ledger section', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetTauriMocks()
    mockCommands()
  })

  it('shows no ledger section when the overlay is absent', () => {
    const wrapper = mount(WorktreeDetailsPanel, {
      props: { worktree: worktreeFixture, repoName: 'scooda', isExpanded: false },
    })

    expect(wrapper.text()).not.toContain('Worktree ledger')
    wrapper.unmount()
  })

  it('renders the unknown state honestly, never as safe', () => {
    const wrapper = mount(WorktreeDetailsPanel, {
      props: {
        worktree: {
          ...worktreeFixture,
          ledger: { available: false, unavailable_reason: 'way exited 3' },
        },
        repoName: 'scooda',
        isExpanded: false,
      },
    })

    const text = wrapper.text()
    expect(text).toContain('its safety is unknown')
    expect(text).toContain('way exited 3')
    wrapper.unmount()
  })

  it('renders checkpoint, next action, drift and workstream rows when available', () => {
    const wrapper = mount(WorktreeDetailsPanel, {
      props: {
        worktree: {
          ...worktreeFixture,
          ledger: {
            available: true,
            workstream_id: 'ws_1',
            checkpoint_at: '2026-08-04T12:00:00Z',
            next_action: 'merge to develop',
            narrative_status: 'present',
            drift: true,
          },
        },
        repoName: 'scooda',
        isExpanded: false,
      },
    })

    const text = wrapper.text()
    expect(text).toContain('merge to develop')
    expect(text).toContain('State has changed since the last checkpoint')
    expect(text).toContain('ws_1')
    wrapper.unmount()
  })

  it('renders no drift row when drift is unstated (null)', () => {
    const wrapper = mount(WorktreeDetailsPanel, {
      props: {
        worktree: {
          ...worktreeFixture,
          ledger: {
            available: true,
            checkpoint_at: '2026-08-04T12:00:00Z',
            drift: null,
          },
        },
        repoName: 'scooda',
        isExpanded: false,
      },
    })

    const text = wrapper.text()
    expect(text).not.toContain('In step with the last checkpoint')
    expect(text).not.toContain('State has changed since the last checkpoint')
    wrapper.unmount()
  })

  it('shows "No checkpoint recorded" and never "In step…" when checkpoint_at is null', () => {
    const wrapper = mount(WorktreeDetailsPanel, {
      props: {
        worktree: {
          ...worktreeFixture,
          ledger: {
            available: true,
            checkpoint_at: null,
            drift: false,
          },
        },
        repoName: 'scooda',
        isExpanded: false,
      },
    })

    const text = wrapper.text()
    expect(text).toContain('No checkpoint recorded')
    expect(text).not.toContain('In step with the last checkpoint')
    wrapper.unmount()
  })

  it('renders "In step with the last checkpoint" when drift is false and a checkpoint exists', () => {
    const wrapper = mount(WorktreeDetailsPanel, {
      props: {
        worktree: {
          ...worktreeFixture,
          ledger: {
            available: true,
            checkpoint_at: '2026-08-04T12:00:00Z',
            drift: false,
          },
        },
        repoName: 'scooda',
        isExpanded: false,
      },
    })

    expect(wrapper.text()).toContain('In step with the last checkpoint')
    wrapper.unmount()
  })

  it('states the risk and that the ledger blocks removal, without offering a way past it', () => {
    const wrapper = mount(WorktreeDetailsPanel, {
      props: {
        worktree: {
          ...worktreeFixture,
          ledger: {
            available: true,
            checkpoint_at: '2026-08-04T12:00:00Z',
            risk: 'critical',
            risk_available: true,
            removal_blocked: true,
          },
        },
        repoName: 'scooda',
        isExpanded: false,
      },
    })

    const text = wrapper.text()
    // "At risk", not "critical": the raw level is the service's word, and
    // Waypoint already says this to a human — see utils/riskVocabulary.
    expect(text).toContain('At risk')
    expect(text).not.toContain('critical')
    expect(text).toContain('blocks removal')
    // Overriding stays a recorded command-line act. No control here may offer
    // it, and no control here may remove the worktree either.
    const controls = wrapper.findAll('button').map((b) => b.text())
    expect(controls.some((label) => /acknowledg|overrid|remove|delete/i.test(label))).toBe(false)
    wrapper.unmount()
  })

  it('says the risk is unknown rather than omitting the row', () => {
    // An omitted Risk row reads as "no risk". The unknown has to be stated.
    const wrapper = mount(WorktreeDetailsPanel, {
      props: {
        worktree: {
          ...worktreeFixture,
          ledger: {
            available: true,
            checkpoint_at: '2026-08-04T12:00:00Z',
            risk: null,
            risk_available: false,
            risk_unavailable_reason: 'no worktree ledger root configured',
          },
        },
        repoName: 'scooda',
        isExpanded: false,
      },
    })

    const text = wrapper.text()
    expect(text).toContain('Risk')
    expect(text).toContain('the risk check could not answer')
    expect(text).toContain('no worktree ledger root configured')
    wrapper.unmount()
  })

  it('distinguishes no risk found from risk unknown', () => {
    const wrapper = mount(WorktreeDetailsPanel, {
      props: {
        worktree: {
          ...worktreeFixture,
          ledger: {
            available: true,
            checkpoint_at: '2026-08-04T12:00:00Z',
            risk: null,
            risk_available: true,
            removal_blocked: false,
          },
        },
        repoName: 'scooda',
        isExpanded: false,
      },
    })

    const text = wrapper.text()
    expect(text).toContain('Clear — the ledger found nothing')
    expect(text).not.toContain('the risk check could not answer')
    wrapper.unmount()
  })

  it('names the lease holder, and says when a claim has expired', () => {
    const holder = {
      tool: 'claude', session_id: 's1', machine_id: 'machine_x',
      acquired_at: '2026-08-06T08:00:00Z', last_heartbeat_at: '2026-08-06T08:20:00Z',
      expires_at: '2026-08-06T08:50:00Z',
    }

    const live = mount(WorktreeDetailsPanel, {
      props: {
        worktree: {
          ...worktreeFixture,
          ledger: {
            available: true, checkpoint_at: '2026-08-04T12:00:00Z',
            lease_available: true, lease_held: true, lease: holder,
          },
        },
        repoName: 'scooda',
        isExpanded: false,
      },
    })
    expect(live.text()).toContain('claude session s1 on machine_x')
    expect(live.text()).toContain('holds it until')
    live.unmount()

    const expired = mount(WorktreeDetailsPanel, {
      props: {
        worktree: {
          ...worktreeFixture,
          ledger: {
            available: true, checkpoint_at: '2026-08-04T12:00:00Z',
            lease_available: true, lease_held: false, lease: holder,
          },
        },
        repoName: 'scooda',
        isExpanded: false,
      },
    })
    expect(expired.text()).toContain('claim expired at')
    expect(expired.text()).not.toContain('holds it until')
    expired.unmount()
  })

  it('does not call a lease expired when the ledger left lease_held unstated', () => {
    const holder = {
      tool: 'claude', session_id: 's1', machine_id: 'machine_x',
      acquired_at: '2026-08-06T08:00:00Z', last_heartbeat_at: '2026-08-06T08:20:00Z',
      expires_at: '2026-08-06T08:50:00Z',
    }

    const wrapper = mount(WorktreeDetailsPanel, {
      props: {
        worktree: {
          ...worktreeFixture,
          ledger: {
            available: true, checkpoint_at: '2026-08-04T12:00:00Z',
            lease_available: true, lease_held: null, lease: holder,
          },
        },
        repoName: 'scooda',
        isExpanded: false,
      },
    })

    const text = wrapper.text()
    expect(text).toContain('claude session s1 on machine_x')
    expect(text).toContain('did not say whether the claim still stands')
    expect(text).not.toContain('claim expired at')
    expect(text).not.toContain('holds it until')
    wrapper.unmount()
  })

  it('says the lease is unknown rather than "no agent has claimed this worktree"', () => {
    const wrapper = mount(WorktreeDetailsPanel, {
      props: {
        worktree: {
          ...worktreeFixture,
          ledger: {
            available: true, checkpoint_at: '2026-08-04T12:00:00Z',
            lease_available: false, lease_unavailable_reason: 'not registered',
            lease_held: null, lease: null,
          },
        },
        repoName: 'scooda',
        isExpanded: false,
      },
    })

    const text = wrapper.text()
    expect(text).toContain('Unknown — not registered')
    expect(text).not.toContain('No agent has claimed this worktree')
    wrapper.unmount()
  })
})
