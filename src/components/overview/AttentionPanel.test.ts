import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AttentionPanel from './AttentionPanel.vue'
import { useOverviewStore } from '@/stores'
import type { Worktree, HealthResult } from '@/types'

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: '/repos/scooda/main',
    branch: 'main',
    sha: 'abc1234',
    dirty: false,
    ahead: 0,
    behind: 0,
    ...overrides,
  }
}

const healthFixture: HealthResult = {
  repo: 'scooda',
  overall_grade: 'F',
  overall_score: 55,
  worktree_count: 1,
  summary: { healthy: 0, warning: 0, critical: 1 },
  issues: [
    {
      severity: 'critical',
      worktree: 'enneagram-assessment',
      message: 'changes:37,age:105d',
    },
  ],
  worktrees: [],
}

describe('AttentionPanel health items', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('shows translated finding titles instead of raw tokens', () => {
    const store = useOverviewStore()
    store.setWorktreeSnapshot('scooda', [makeWorktree()], 1000)
    store.setHealth('scooda', healthFixture)

    const wrapper = mount(AttentionPanel)
    const text = wrapper.text()

    expect(text).toContain('37 uncommitted changes')
    expect(text).toContain('No commits for 105 days')
    expect(text).not.toContain('changes:37')
    expect(text).not.toContain('age:105d')
    wrapper.unmount()
  })

  it('explains severity on the dot tooltip', () => {
    const store = useOverviewStore()
    store.setWorktreeSnapshot('scooda', [makeWorktree()], 1000)
    store.setHealth('scooda', healthFixture)

    const wrapper = mount(AttentionPanel)
    const dot = wrapper.find('.severity-dot[title]')

    expect(dot.exists()).toBe(true)
    expect(dot.attributes('title')).toContain('below 60')
    wrapper.unmount()
  })
})

describe('AttentionPanel ledger items', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('renders the uncheckpointed work group with risk-wins reason text', () => {
    const store = useOverviewStore()
    store.setWorktreeSnapshot('scooda', [
      makeWorktree({
        path: '/repos/scooda/a',
        branch: 'a',
        ledger: { available: true, drift: true, risk_available: true, risk: null },
      }),
      makeWorktree({
        path: '/repos/scooda/b',
        branch: 'b',
        ledger: { available: true, drift: true, risk_available: true, risk: 'critical' },
      }),
    ], 1000)

    const wrapper = mount(AttentionPanel)
    const text = wrapper.text()

    expect(text).toContain('Drifted or at risk')
    expect(text).toContain('Drifted since last checkpoint')
    expect(text).toContain('Critical ledger risk')
    wrapper.unmount()
  })

  it('lists a worktree whose risk could not be established, and names it as unknown', () => {
    // This panel is the one place that aggregates safety. A risk nobody could
    // establish must not be omitted here, or it is silently counted as fine —
    // and it must not be described as merely "drifted" either.
    const store = useOverviewStore()
    store.setWorktreeSnapshot('scooda', [
      makeWorktree({
        path: '/repos/scooda/a',
        branch: 'a',
        ledger: {
          available: true,
          drift: false,
          risk_available: false,
          risk_unavailable_reason: 'no worktree ledger root configured',
        },
      }),
    ], 1000)

    const wrapper = mount(AttentionPanel)
    const text = wrapper.text()

    expect(text).toContain('Drifted or at risk')
    expect(text).toContain('Ledger risk unknown')
    expect(text).not.toContain('Drifted since last checkpoint')
    wrapper.unmount()
  })

  it('hides the drifted-or-at-risk group when no ledger is answerably drifted or critical', () => {
    const store = useOverviewStore()
    store.setWorktreeSnapshot('scooda', [
      makeWorktree({ path: '/repos/scooda/a', branch: 'a', ledger: { available: false } }),
      makeWorktree({ path: '/repos/scooda/b', branch: 'b' }),
    ], 1000)

    const wrapper = mount(AttentionPanel)

    expect(wrapper.text()).not.toContain('Drifted or at risk')
    wrapper.unmount()
  })
})
