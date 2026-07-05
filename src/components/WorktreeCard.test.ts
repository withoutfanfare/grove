import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import WorktreeCard from './WorktreeCard.vue'
import type { Worktree, DiffStats } from '../types'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'
import { useRepoConfigStore } from '@/stores/repoConfig'
import { useWorktreeStore } from '@/stores'
import { resetWorktreeDiagnosticsForTests } from '@/composables/useWorktreeDiagnostics'

const worktree: Worktree = {
  path: '/repos/grove/feature-login',
  branch: 'feature/login',
  sha: 'abc1234',
  dirty: true,
  ahead: 0,
  behind: 0,
}

const diffStats: DiffStats = {
  files_changed: 5,
  lines_added: 120,
  lines_removed: 45,
  display: '5 files, +120/-45',
  file_list: ['src/a.ts', 'src/b.ts'],
}

function mountCard() {
  return mount(WorktreeCard, {
    props: { worktree, repoName: 'grove' },
    global: {
      stubs: {
        Dropdown: true,
        DropdownItem: true,
        WorktreeDetailsPanel: true,
      },
    },
  })
}

describe('WorktreeCard diff-stats badge', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetWorktreeDiagnosticsForTests()
    resetTauriMocks()
    mockTauriInvoke.mockImplementation((command: string) => {
      if (command === 'get_diff_stats') {
        return Promise.resolve(diffStats)
      }
      return Promise.resolve(undefined)
    })
  })

  it('renders additions in a success span and deletions in a danger span', async () => {
    const wrapper = mountCard()
    await flushPromises()

    const added = wrapper.find('span.text-success')
    const removed = wrapper.find('span.text-danger')

    expect(added.exists()).toBe(true)
    expect(added.text()).toBe('+120')
    expect(removed.exists()).toBe(true)
    expect(removed.text()).toBe('-45')
  })

  it('renders the file count without colour classes', async () => {
    const wrapper = mountCard()
    await flushPromises()

    const fileCountSpan = wrapper
      .findAll('span')
      .find((span) => span.text() === '5 files')

    expect(fileCountSpan).toBeTruthy()
    expect(fileCountSpan!.classes()).not.toContain('text-success')
    expect(fileCountSpan!.classes()).not.toContain('text-danger')
  })
})

describe('WorktreeCard diagnostics queue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetWorktreeDiagnosticsForTests()
    resetTauriMocks()
  })

  it('caps concurrent diff-stat requests across mounted cards', async () => {
    let active = 0
    let maxActive = 0
    const resolveDiffs: Array<() => void> = []
    mockTauriInvoke.mockImplementation((command: string) => {
      if (command !== 'get_diff_stats') return Promise.resolve(undefined)

      active += 1
      maxActive = Math.max(maxActive, active)
      return new Promise((resolve) => {
        resolveDiffs.push(() => {
          active -= 1
          resolve(diffStats)
        })
      })
    })

    const wrappers = Array.from({ length: 8 }, (_, index) => mountCardWithWorktree({
      ...worktree,
      dirty: false,
      path: `/repos/grove/worktree-${index}`,
      branch: `feature/${index}`,
    }))
    await flushPromises()

    expect(diffStatCalls()).toBe(4)
    expect(maxActive).toBe(4)

    resolveDiffs.shift()!()
    await flushPromises()

    expect(diffStatCalls()).toBe(5)
    expect(maxActive).toBe(4)

    resolveDiffs.splice(0).forEach(resolve => resolve())
    await flushPromises()
    wrappers.forEach(wrapper => wrapper.unmount())
  })
})

describe('WorktreeCard selection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetWorktreeDiagnosticsForTests()
    resetTauriMocks()
    mockTauriInvoke.mockImplementation((command: string) => {
      if (command === 'get_diff_stats') {
        return Promise.resolve(diffStats)
      }
      return Promise.resolve(undefined)
    })
  })

  it('emits select with the branch and toggles details when the content row is clicked', async () => {
    const wrapper = mountCard()
    await flushPromises()

    const contentRow = wrapper.find('[role="button"]')
    expect(contentRow.exists()).toBe(true)

    await contentRow.trigger('click')

    const selectEvents = wrapper.emitted('select')
    expect(selectEvents).toBeTruthy()
    expect(selectEvents![0]).toEqual(['feature/login'])

    // Selection is additive — the click still expands the details panel
    expect(wrapper.find('[role="article"]').classes()).toContain('card-expanded')
  })
})

describe('WorktreeCard selection checkbox', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetWorktreeDiagnosticsForTests()
    resetTauriMocks()
    mockTauriInvoke.mockResolvedValue(undefined)
  })

  const selectableWt: Worktree = {
    path: '/repos/grove/feature-x', branch: 'feature/x', sha: 'abc', dirty: false, ahead: 0, behind: 0,
  }

  function mountSelectable(wt: Worktree = selectableWt) {
    return mount(WorktreeCard, {
      props: { worktree: wt, repoName: 'grove' },
      global: { stubs: { Dropdown: true, DropdownItem: true, WorktreeDetailsPanel: true } },
    })
  }

  it('renders a selection checkbox', () => {
    const wrapper = mountSelectable()
    expect(wrapper.find('[data-testid="wt-select"]').exists()).toBe(true)
  })

  it('emits toggle-select with the path and shift flag on click', async () => {
    const wrapper = mountSelectable()
    await wrapper.find('[data-testid="wt-select"]').trigger('click', { shiftKey: true })
    const events = wrapper.emitted('toggle-select')
    expect(events).toBeTruthy()
    expect(events![0][0]).toEqual({ path: '/repos/grove/feature-x', shift: true })
  })

  it('disables the checkbox for protected branches and does not emit', async () => {
    const repoConfig = useRepoConfigStore()
    repoConfig.effectiveConfig = { protected_branches: ['main'] } as any
    const wrapper = mountSelectable({ ...selectableWt, branch: 'main' })
    const box = wrapper.find('[data-testid="wt-select"]')
    expect(box.attributes('disabled')).toBeDefined()
    await box.trigger('click')
    expect(wrapper.emitted('toggle-select')).toBeFalsy()
  })

  it('shows the checked state when the path is selected', () => {
    const store = useWorktreeStore()
    store.setSelection(['/repos/grove/feature-x'])
    const wrapper = mountSelectable()
    expect(wrapper.find('[data-testid="wt-select"]').classes()).toContain('wt-select-checkbox--checked')
  })

  it('does not show the checkbox persistently when nothing is selected', () => {
    const wrapper = mountSelectable()
    expect(wrapper.find('[data-testid="wt-select"]').classes()).not.toContain('wt-select-checkbox--visible')
  })

  it('shows the checkbox persistently once any worktree is selected', () => {
    const store = useWorktreeStore()
    store.setSelection(['/some/other/path'])
    const wrapper = mountSelectable()
    expect(wrapper.find('[data-testid="wt-select"]').classes()).toContain('wt-select-checkbox--visible')
  })
})

function mountCardWithWorktree(wt: Worktree) {
  return mount(WorktreeCard, {
    props: { worktree: wt, repoName: 'grove' },
    global: {
      stubs: {
        Dropdown: true,
        DropdownItem: true,
        WorktreeDetailsPanel: true,
      },
    },
  })
}

function diffStatCalls(): number {
  return mockTauriInvoke.mock.calls.filter(([command]) => command === 'get_diff_stats').length
}
