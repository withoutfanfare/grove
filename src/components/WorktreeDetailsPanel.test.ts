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

describe('WorktreeDetailsPanel evidence', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetTauriMocks()
    mockCommands()
  })

  it('explains merge and staleness with the exact base, commits and check time, kept apart from folder age', async () => {
    const wrapper = mount(WorktreeDetailsPanel, {
      props: {
        worktree: {
          ...worktreeFixture,
          merged: true,
          stale: false,
          base_ref: 'origin/main',
          base_sha: 'aaaaaaa1111',
          head_sha: 'bbbbbbb2222',
          behind_base: 3,
          behind_threshold: 50,
          checked_at: new Date().toISOString(),
          lastAccessed: '2026-01-01T00:00:00Z',
        },
        repoName: 'scooda',
        isExpanded: true,
      },
    })
    await flushPromises()
    const facts = wrapper.get('[data-testid="comparison-facts"]').text()
    expect(facts).toContain('bbbbbbb is contained in origin/main @ aaaaaaa')
    expect(facts).toContain('not a removal safety check')
    expect(facts).toContain('3 commits behind origin/main (stale threshold 50)')
    expect(facts).toContain('remote refs as of the last fetch')
    expect(facts).toContain('Folder last modified')
    expect(facts).toContain('not when it was last opened')
  })

  it('reports failed merge and behind-base checks as unknown, and unknown sync as unknown', async () => {
    const wrapper = mount(WorktreeDetailsPanel, {
      props: {
        worktree: { ...worktreeFixture, ahead: null, behind: null, merged: null, stale: null, behind_base: null, base_ref: 'origin/main' },
        repoName: 'scooda',
        isExpanded: true,
      },
    })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('Unknown: the ancestry check against origin/main failed')
    expect(text).toContain('Unknown: counting commits behind origin/main failed')
    expect(text).toContain('Comparison with its upstream is unknown')
    expect(text).not.toContain('synchronised')
  })

  it('answers "Why this grade?" from the cached health check findings', async () => {
    const { useOverviewStore } = await import('@/stores')
    const overview = useOverviewStore()
    overview.setWorktreeSnapshot('scooda', [worktreeFixture], 1000)
    overview.setHealth('scooda', {
      repo: 'scooda', overall_grade: 'C', overall_score: 75, worktree_count: 1,
      summary: { healthy: 0, warning: 1, critical: 0 }, issues: [],
      worktrees: [{ branch: '2fa-enforce', grade: 'C', score: 75, issues: ['changes:6', 'unmerged'] }],
    }, Date.now())
    const wrapper = mount(WorktreeDetailsPanel, {
      props: { worktree: { ...worktreeFixture, health_grade: 'C', health_score: 75 }, repoName: 'scooda', isExpanded: true },
    })
    await flushPromises()
    const findings = wrapper.get('[data-testid="grade-findings"]').text()
    expect(findings).toContain('Why this grade?')
    expect(findings).toContain('6 uncommitted changes')
    expect(findings).toContain('(-10)')
    expect(findings).toContain('health check just now')
  })
})

describe('WorktreeDetailsPanel grade wording', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetTauriMocks()
    mockCommands()
  })

  it('never claims generic excellent health, and calls an unscored worktree unknown', async () => {
    const wrapper = mount(WorktreeDetailsPanel, {
      props: { worktree: { ...worktreeFixture, health_grade: '?', health_score: 0 }, repoName: 'scooda', isExpanded: true },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Health unknown')
    expect(wrapper.text()).not.toMatch(/Excellent|clean and up to date/)

    await wrapper.setProps({ worktree: { ...worktreeFixture, health_grade: 'A', health_score: 95 } })
    expect(wrapper.text()).toContain('Grade A, score 95/100')
    expect(wrapper.text()).not.toMatch(/Excellent|clean and up to date/)
  })
})
