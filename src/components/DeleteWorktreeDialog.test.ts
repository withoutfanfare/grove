import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DeleteWorktreeDialog from './DeleteWorktreeDialog.vue'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'
import { useWorktreeStore } from '@/stores'
import type { Worktree } from '@/types'

const mockRemoveWorktree = vi.fn()

vi.mock('../composables', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../composables')>()
  return {
    ...actual,
    useWorktrees: () => ({ removeWorktree: mockRemoveWorktree }),
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

function mockCommands() {
  mockTauriInvoke.mockResolvedValue(undefined)
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

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'Delete Worktree')
    await deleteButton!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('This worktree cannot be removed yet')
    expect(wrapper.text()).toContain('?? notes.txt')
    wrapper.unmount()
  })
})
