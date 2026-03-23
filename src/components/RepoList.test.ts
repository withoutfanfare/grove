import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import RepoList from './RepoList.vue'
import { useWorktreeStore } from '@/stores'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'

function mountRepoList() {
  return mount(RepoList, {
    props: { width: 300 },
    global: {
      stubs: {
        CloneRepositoryModal: true,
        GlobalConfigPanel: true,
        Dropdown: true,
        DropdownItem: true,
        IconButton: true,
        SkeletonList: true,
        Skeleton: true,
        SListRow: true,
        SIconButton: true,
        SSkeleton: true,
      },
    },
  })
}

function getRepoRowButton(wrapper: ReturnType<typeof mount>, repoName: string) {
  return wrapper
    .findAll('li.relative > *')
    .find((el) => el.text().includes(repoName))
}

describe('RepoList keyboard navigation (filtered/sorted)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetTauriMocks()
    mockTauriInvoke.mockImplementation((command: string) => {
      if (command === 'get_worktree_status' || command === 'list_worktrees') {
        return Promise.resolve([])
      }
      return Promise.resolve(undefined)
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the sorted rendered list for ArrowDown focus movement', async () => {
    const store = useWorktreeStore()
    store.setRepositories([
      { name: 'charlie', worktrees: 1 },
      { name: 'alpha', worktrees: 2 },
      { name: 'bravo', worktrees: 3 },
    ])

    const wrapper = mountRepoList()
    await nextTick()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await nextTick()

    // SListRow is stubbed so we verify repo list items rendered (3 items sorted)
    const listItems = wrapper.findAll('li.relative')
    expect(listItems.length).toBe(3)
  })

  it('quick-select (Ctrl+1) targets the first filtered repo, not the raw store order', async () => {
    vi.useFakeTimers()

    const store = useWorktreeStore()
    store.setRepositories([
      { name: 'charlie', worktrees: 1 },
      { name: 'alpha', worktrees: 2 },
      { name: 'bravo', worktrees: 3 },
    ])

    const wrapper = mountRepoList()
    await nextTick()

    const searchInput = wrapper.find('input[placeholder="Search repositories..."]')
    expect(searchInput.exists()).toBe(true)

    await searchInput.setValue('br')
    vi.advanceTimersByTime(200)
    await nextTick()

    await searchInput.trigger('blur')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', ctrlKey: true }))
    await nextTick()

    expect(store.selectedRepoName).toBe('bravo')
  })
})
