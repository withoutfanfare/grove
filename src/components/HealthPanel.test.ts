import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HealthPanel from './HealthPanel.vue'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'
import type { HealthResult, Worktree } from '@/types'

const healthFixture: HealthResult = {
  repo: 'scooda',
  overall_grade: 'F',
  overall_score: 55,
  worktree_count: 2,
  summary: { healthy: 0, warning: 0, critical: 2 },
  issues: [
    { severity: 'critical', worktree: 'enneagram-assessment', message: 'behind:12,changes:37' },
    { severity: 'critical', worktree: 'enneagram-assessment-fixup', message: 'changes:88,age:105d' },
  ],
  worktrees: [
    { branch: 'enneagram-assessment', grade: 'F', score: 55, issues: ['behind:12,changes:37'] },
    { branch: 'enneagram-assessment-fixup', grade: 'F', score: 55, issues: ['changes:88,age:105d'] },
  ],
}

const worktreeFixture: Worktree[] = [
  {
    path: '/repos/scooda/enneagram-assessment',
    branch: 'enneagram-assessment',
    sha: 'abc1234',
    dirty: true,
    ahead: 0,
    behind: 12,
  },
  {
    path: '/repos/scooda/enneagram-assessment-fixup',
    branch: 'enneagram-assessment-fixup',
    sha: 'def5678',
    dirty: true,
    ahead: 0,
    behind: 0,
  },
]

function mockCommands() {
  mockTauriInvoke.mockImplementation((command: string) => {
    if (command === 'get_repo_health') return Promise.resolve(healthFixture)
    if (command === 'list_worktrees') return Promise.resolve(worktreeFixture)
    if (command === 'pull_worktree') {
      return Promise.resolve({
        success: true,
        already_up_to_date: false,
        conflicts: false,
        commits_pulled: 12,
        message: 'Updated 12 commits',
      })
    }
    return Promise.resolve(undefined)
  })
}

async function mountOpenPanel() {
  const wrapper = mount(HealthPanel, {
    props: { isOpen: false, repoName: 'scooda' },
    global: {
      stubs: {
        DeleteWorktreeDialog: true,
        GradeBadge: true,
      },
    },
  })
  // The panel fetches when isOpen flips to true (watch, not immediate)
  await wrapper.setProps({ isOpen: true })
  await flushPromises()
  return wrapper
}

describe('HealthPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    resetTauriMocks()
    mockCommands()
  })

  it('renders translated findings grouped by worktree, never raw tokens', async () => {
    const wrapper = await mountOpenPanel()
    const text = wrapper.text()

    expect(text).toContain('12 commits behind base')
    expect(text).toContain('37 uncommitted changes')
    expect(text).toContain('88 uncommitted changes')
    expect(text).toContain('No commits for 105 days')
    expect(text).not.toContain('behind:12')
    expect(text).not.toContain('changes:37')
    expect(text).not.toContain('age:105d')
    wrapper.unmount()
  })

  it('shows score impact, severity legend and the scoring explainer', async () => {
    const wrapper = await mountOpenPanel()
    const text = wrapper.text()

    expect(text).toContain('-10 pts')
    expect(text).toContain('-25 pts')
    expect(text).toContain('score below 60')
    expect(text).toContain('How scoring works')
    expect(text).toContain('Commits behind base')
    wrapper.unmount()
  })

  it('explains severity on the chip tooltip', async () => {
    const wrapper = await mountOpenPanel()
    const chip = wrapper.find('[title*="below 60"]')

    expect(chip.exists()).toBe(true)
    wrapper.unmount()
  })

  it('runs the Pull action through pull_worktree and refreshes the report', async () => {
    const wrapper = await mountOpenPanel()
    const pullButton = wrapper.findAll('button').find((b) => b.text() === 'Pull')
    expect(pullButton).toBeDefined()

    await pullButton!.trigger('click')
    await flushPromises()

    const pullCalls = mockTauriInvoke.mock.calls.filter((call) => call[0] === 'pull_worktree')
    expect(pullCalls).toHaveLength(1)
    expect(pullCalls[0][1]).toMatchObject({ repo: 'scooda', branch: 'enneagram-assessment' })
    // Health refetched after the action (initial fetch + silent refresh)
    const healthCalls = mockTauriInvoke.mock.calls.filter((call) => call[0] === 'get_repo_health')
    expect(healthCalls.length).toBeGreaterThanOrEqual(2)
    wrapper.unmount()
  })

  it('routes the destructive Remove action through the delete dialog', async () => {
    const wrapper = await mountOpenPanel()
    const removeButton = wrapper.findAll('button').find((b) => b.text().includes('Remove'))
    expect(removeButton).toBeDefined()

    await removeButton!.trigger('click')
    await flushPromises()

    const dialog = wrapper.findComponent({ name: 'DeleteWorktreeDialog' })
    expect(dialog.props('isOpen')).toBe(true)
    expect(dialog.props('worktree')).toMatchObject({ branch: 'enneagram-assessment-fixup' })
    expect(dialog.props('repoName')).toBe('scooda')
    wrapper.unmount()
  })

  it('derives the summary tiles from the CLI worktree brackets', async () => {
    const wrapper = await mountOpenPanel()

    // summary: 0 healthy, 0 warning, 2 critical
    expect(wrapper.text()).toContain('Critical')
    const tile = wrapper.find('[title="Worktrees scoring below 60"]')
    expect(tile.exists()).toBe(true)
    wrapper.unmount()
  })
})
