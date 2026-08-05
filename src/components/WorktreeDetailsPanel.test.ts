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
})
