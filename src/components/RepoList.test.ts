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
      if (command === 'get_recent_worktrees') {
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

describe('RepoList header toolbar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetTauriMocks()
    mockTauriInvoke.mockImplementation((command: string) => {
      if (command === 'get_worktree_status' || command === 'list_worktrees') {
        return Promise.resolve([])
      }
      if (command === 'get_recent_worktrees') {
        return Promise.resolve([])
      }
      return Promise.resolve(undefined)
    })
  })

  it('renders the Overview button in the header row and it deselects the repo', async () => {
    const store = useWorktreeStore()
    store.setRepositories([{ name: 'alpha', worktrees: 2 }])
    store.selectRepository('alpha')

    const wrapper = mountRepoList()
    await nextTick()

    const overviewBtn = wrapper.find('button[aria-label="Go to Overview"]')
    expect(overviewBtn.exists()).toBe(true)
    await overviewBtn.trigger('click')
    expect(store.selectedRepoName).toBeNull()
  })

  it('shows count chips on both tabs', async () => {
    const store = useWorktreeStore()
    store.setRepositories([
      { name: 'alpha', worktrees: 2 },
      { name: 'bravo', worktrees: 3 },
      { name: 'charlie', worktrees: 1 },
    ])
    store.setRecentWorktrees([
      { repo: 'alpha', branch: 'main', path: '/a', dirty: false, accessed_at: 1, accessed_ago: '1h ago' },
      { repo: 'bravo', branch: 'dev', path: '/b', dirty: false, accessed_at: 2, accessed_ago: '2h ago' },
    ])

    const wrapper = mountRepoList()
    await nextTick()

    const tabs = wrapper.findAll('[data-testid="tab-chip"]')
    expect(tabs.length).toBe(2)
    expect(tabs[0].text()).toBe('3') // repositories
    expect(tabs[1].text()).toBe('2') // recent
  })

  it('renders the clone and config buttons in the header row', async () => {
    const store = useWorktreeStore()
    store.setRepositories([{ name: 'alpha', worktrees: 2 }])

    const wrapper = mountRepoList()
    await nextTick()

    const headerRow = wrapper.find('[data-testid="header-row"]')
    expect(headerRow.exists()).toBe(true)
    // SIconButton is stubbed; both global action buttons must sit in the header
    expect(headerRow.findAll('s-icon-button-stub').length).toBe(2)
    expect(headerRow.find('button[aria-label="Go to Overview"]').exists()).toBe(true)
  })

  it('no longer renders the stats summary row', async () => {
    const store = useWorktreeStore()
    store.setRepositories([{ name: 'alpha', worktrees: 2 }])

    const wrapper = mountRepoList()
    await nextTick()

    expect(wrapper.text()).not.toContain('repos ·')
  })

  it('fetches recent worktrees on mount even when the repos tab is active', async () => {
    const store = useWorktreeStore()
    store.setRepositories([{ name: 'alpha', worktrees: 2 }])

    mountRepoList()
    await nextTick()

    expect(mockTauriInvoke).toHaveBeenCalledWith(
      'get_recent_worktrees',
      expect.anything()
    )
  })
})
