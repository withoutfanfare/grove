import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DeleteWorktreeDialog from './DeleteWorktreeDialog.vue'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'
import { useWorktreeStore } from '@/stores'
import type { Worktree } from '@/types'

const mockRemoveWorktree = vi.fn()
// When true, the dialogue gets the real useWorktrees(), so a test can drive
// the production catch-and-resolve-null path from the Tauri boundary.
let useRealWorktrees = false

vi.mock('../composables', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../composables')>()
  return {
    ...actual,
    useWorktrees: () => (useRealWorktrees ? actual.useWorktrees() : { removeWorktree: mockRemoveWorktree }),
  }
})

const baseWorktree: Worktree = {
  path: '/repos/scooda/feature-x',
  branch: 'feature-x',
  sha: 'abc1234',
  dirty: false,
  ahead: 0,
  behind: 0,
}

// The real CLI's REMOVAL_BLOCKED message (see src-tauri/src/wt.rs's
// `removal_blocked_error_keeps_the_gate_account_line_by_line` test): the
// removal gate's account of what would be lost, one line per item, then its
// instruction. The dialogue must render this verbatim without offering an
// in-GUI control that forces the removal past it.
const REMOVAL_BLOCKED_ERROR = {
  code: 'REMOVAL_BLOCKED',
  message:
    'Removing ~/Herd/scooda-worktrees/feature-x would lose:\n  - 1 uncommitted change(s):\n      ?? notes.txt\n  - 1 commit(s) no remote has:\n      3fe9562 local only\n  - a live agent session working here: codex session abcdef12…, last seen 01:10\nCommit and push the work, or wait for the session to end, then try again.',
}

const clearPreflight = {
  repo: 'scooda',
  branch: 'feature-x',
  path: '/repos/scooda/feature-x',
  verdict: 'clear',
  checked_at: '2026-11-03T09:00:00Z',
  checks: [{ id: 'uncommitted', label: 'Unsaved work', state: 'clear', message: 'No uncommitted changes' }],
}

function mockCommands(preflight: unknown = clearPreflight, config: unknown = { protected_branches: [] }) {
  mockTauriInvoke.mockImplementation((command: string) =>
    command === 'get_removal_preflight' ? Promise.resolve(preflight)
      : command === 'get_config' ? Promise.resolve(config)
      : Promise.resolve(undefined)
  )
}

function mountDialog(worktree: Worktree | null) {
  return mount(DeleteWorktreeDialog, {
    props: { isOpen: true, worktree, repoName: 'scooda' },
    global: {
      stubs: {
        SModal: { template: '<div><slot /><slot name="footer" /></div>' },
        // `data-disabled` rather than the real attribute: jsdom's handling of
        // clicks on disabled buttons is unreliable, and these tests need to
        // prove the handler guards hold even if a click gets through.
        SButton: {
          props: ['disabled', 'loading'],
          emits: ['click'],
          template: '<button :data-disabled="disabled ? \'true\' : \'false\'" @click="$emit(\'click\')"><slot /></button>',
        },
        SCheckbox: {
          props: ['modelValue'],
          template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
        },
      },
    },
  })
}

/**
 * Accessible-name approximation for every interactive control in the
 * dialogue (buttons, links, inputs). Used to assert no force/override
 * *control* exists — independent of the verbatim CLI prose rendered
 * elsewhere in the panel.
 */
function interactiveControlLabels(wrapper: ReturnType<typeof mountDialog>): string[] {
  return wrapper.findAll('button, a, input, [role="button"]').map((el) =>
    [el.attributes('aria-label'), el.text(), el.attributes('value'), el.attributes('placeholder')]
      .filter(Boolean)
      .join(' ')
  )
}

describe('DeleteWorktreeDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetTauriMocks()
    mockCommands()
    mockRemoveWorktree.mockReset()
    useRealWorktrees = false
  })

  function deleteButton(wrapper: ReturnType<typeof mountDialog>) {
    return wrapper.findAll('button').find((b) => b.text() === 'Delete Worktree')!
  }

  const okResponse = (success = true) => ({
    result: { success, repo: 'scooda', branch: 'feature-x', path: '/repos/scooda/feature-x', branch_deleted: true, db_drop_requested: false },
    hooks: [],
  })

  it('never forces a routine deletion, so current-site and database checks stay on', async () => {
    mockRemoveWorktree.mockResolvedValueOnce(okResponse())
    const wrapper = mountDialog(baseWorktree)
    await flushPromises()
    await deleteButton(wrapper).trigger('click')
    await flushPromises()

    expect(mockRemoveWorktree).toHaveBeenCalledWith(expect.objectContaining({ force: false }))
    wrapper.unmount()
  })

  it('confirms only branch protection after the branch name is typed, retaining other safeguards', async () => {
    mockCommands(clearPreflight, { protected_branches: ['release/*'] })
    mockRemoveWorktree.mockResolvedValueOnce(okResponse())
    const wrapper = mountDialog({ ...baseWorktree, branch: 'release/1.0' })
    await flushPromises()

    expect(wrapper.text()).toMatch(/Current-site, database and unsaved-work safeguards still apply/)
    await wrapper.get('input:not([type="checkbox"])').setValue('release/1.0')
    await flushPromises()
    await deleteButton(wrapper).trigger('click')
    await flushPromises()

    expect(mockRemoveWorktree).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
    wrapper.unmount()
  })

  it('keeps every line of a non-gate refusal and stays usable (production null path)', async () => {
    useRealWorktrees = true
    const refusal = {
      code: 'WORKTREE_IN_USE',
      message: "worktree is selected by 'scooda-current'\nswitch the live site first",
    }
    mockTauriInvoke.mockImplementation((command: string) =>
      command === 'remove_worktree' ? Promise.reject(refusal)
        : command === 'get_removal_preflight' ? Promise.resolve(clearPreflight)
        : Promise.resolve(undefined)
    )
    const wrapper = mountDialog(baseWorktree)
    await flushPromises()
    await deleteButton(wrapper).trigger('click')
    await flushPromises()

    expect(mockTauriInvoke).toHaveBeenCalledWith('remove_worktree', expect.objectContaining({ force: false }))
    const shown = wrapper.findAll('.whitespace-pre-wrap').map((el) => el.text())
    expect(shown).toContain(refusal.message)
    expect(wrapper.text()).not.toContain('deleted successfully')
    expect(deleteButton(wrapper).attributes('data-disabled')).toBe('false')
    expect(wrapper.emitted('deleted')).toBeUndefined()
    wrapper.unmount()
  })

  it('does not report success when the CLI result says the removal failed', async () => {
    mockRemoveWorktree.mockResolvedValueOnce(okResponse(false))
    const wrapper = mountDialog(baseWorktree)
    await flushPromises()
    await deleteButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('deleted successfully')
    expect(wrapper.emitted('deleted')).toBeUndefined()
    expect(deleteButton(wrapper)).toBeDefined()
    wrapper.unmount()
  })

  it("shows the removal gate's account line by line and no override control", async () => {
    // Real production path: useWorktrees().removeWorktree() never rejects —
    // it catches internally, records the typed WtError on the worktrees
    // store, and resolves null. The dialogue must read the error from there.
    mockRemoveWorktree.mockImplementationOnce(async () => {
      useWorktreeStore().setError(REMOVAL_BLOCKED_ERROR)
      return null
    })
    const wrapper = mountDialog(baseWorktree)
    await flushPromises()

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'Delete Worktree')
    expect(deleteButton).toBeDefined()

    await deleteButton!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('This worktree cannot be removed yet')
    expect(wrapper.text()).toContain('Nothing has been deleted')
    // The gate's lines stay separate: a run-together account of three
    // different losses is not an account anyone can act on.
    const account = wrapper.get('.whitespace-pre-wrap').text()
    expect(account).toContain('would lose:\n  - 1 uncommitted change(s):\n      ?? notes.txt')
    expect(account).toContain('3fe9562 local only')
    expect(account).toContain('a live agent session working here')
    // No interactive control's accessible name offers to force, override or
    // remove anyway on the user's behalf.
    const labels = interactiveControlLabels(wrapper)
    expect(labels.some((label) => /force|override|anyway/i.test(label))).toBe(false)
    wrapper.unmount()
  })

  it('also honours the removal gate when removeWorktree rejects directly', async () => {
    // Fallback path: the dialogue's catch still handles a direct rejection
    // (e.g. a differently-wired caller), not only the resolve-null path.
    mockRemoveWorktree.mockRejectedValueOnce(REMOVAL_BLOCKED_ERROR)
    const wrapper = mountDialog(baseWorktree)
    await flushPromises()

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'Delete Worktree')
    await deleteButton!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('This worktree cannot be removed yet')
    expect(wrapper.text()).toContain('?? notes.txt')
    wrapper.unmount()
  })

  describe('read-only removal preflight', () => {
    it('keeps the branch by default and names the exact folder', async () => {
      mockRemoveWorktree.mockResolvedValueOnce(okResponse())
      const wrapper = mountDialog(baseWorktree)
      await flushPromises()

      expect(wrapper.get('[data-testid="delete-consequences"]').text()).toContain('/repos/scooda/feature-x')
      expect(wrapper.text()).toContain('kept in the repository')
      await deleteButton(wrapper).trigger('click')
      await flushPromises()
      expect(mockRemoveWorktree).toHaveBeenCalledWith(expect.objectContaining({ deleteBranch: false }))
      wrapper.unmount()
    })

    it('reconciles an already absent worktree during preflight without attempting deletion', async () => {
      useRealWorktrees = true
      const store = useWorktreeStore()
      store.setRepositories([{ name: 'scooda', worktrees: 1 }])
      store.selectRepository('scooda')
      store.setWorktrees([baseWorktree])
      mockTauriInvoke.mockImplementation((command: string) => command === 'get_removal_preflight'
        ? Promise.reject({ code: 'WORKTREE_NOT_FOUND', message: "no matching worktree registered" })
        : Promise.resolve({ protected_branches: [] }))
      const wrapper = mountDialog(baseWorktree)
      await flushPromises()
      expect(store.worktrees).toEqual([])
      expect(wrapper.emitted('close')).toBeTruthy()
      expect(mockTauriInvoke.mock.calls.some((call) => call[0] === 'remove_worktree')).toBe(false)
      wrapper.unmount()
    })

    it('blocks deletion when a check is unknown, and says why', async () => {
      mockCommands({ ...clearPreflight, verdict: 'unknown', checks: [{ id: 'unsaved_commits', state: 'unknown', message: 'git rev-list failed' }] })
      const wrapper = mountDialog(baseWorktree)
      await flushPromises()

      expect(wrapper.text()).toContain('git rev-list failed')
      expect(wrapper.text()).toContain('removal is blocked')
      expect(deleteButton(wrapper).attributes('data-disabled')).toBe('true')
      await deleteButton(wrapper).trigger('click')
      await flushPromises()
      expect(mockRemoveWorktree).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('blocks deletion when the preflight itself fails (never treated as clear)', async () => {
      mockTauriInvoke.mockImplementation((command: string) =>
        command === 'get_removal_preflight'
          ? Promise.reject({ code: 'COMMAND_FAILED', message: 'removal-check timed out' })
          : Promise.resolve(undefined)
      )
      const wrapper = mountDialog(baseWorktree)
      await flushPromises()

      expect(wrapper.text()).toContain('removal-check timed out')
      await deleteButton(wrapper).trigger('click')
      await flushPromises()
      expect(mockRemoveWorktree).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('describes uncommitted changes as blocking removal, not as lost work', async () => {
      const wrapper = mountDialog({ ...baseWorktree, dirty: true })
      await flushPromises()
      expect(wrapper.text()).toContain('Uncommitted changes block removal')
      expect(wrapper.text()).not.toContain('will be lost')
      wrapper.unmount()
    })

    it('re-checks with the options chosen and passes protection only after typed confirmation', async () => {
      mockCommands(clearPreflight, { protected_branches: ['release/*'] })
      const wrapper = mountDialog({ ...baseWorktree, branch: 'release/1.0' })
      await flushPromises()
      const preflightCalls = () => mockTauriInvoke.mock.calls.filter((c) => c[0] === 'get_removal_preflight')

      expect(preflightCalls()[0][1]).toMatchObject({ branch: 'release/1.0', deleteBranch: false, allowProtected: undefined })
      await wrapper.findAll('input[type="checkbox"]')[0].setValue(true)
      await flushPromises()
      expect(preflightCalls().at(-1)![1]).toMatchObject({ deleteBranch: true })
      await wrapper.get('input:not([type="checkbox"])').setValue('release/1.0')
      await flushPromises()
      expect(preflightCalls().at(-1)![1]).toMatchObject({ allowProtected: true })
      wrapper.unmount()
    })
  })
})
