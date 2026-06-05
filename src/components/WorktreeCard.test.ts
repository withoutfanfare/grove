import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import WorktreeCard from './WorktreeCard.vue'
import type { Worktree, DiffStats } from '../types'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'

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

describe('WorktreeCard selection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
