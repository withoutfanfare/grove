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

// The real CLI's LEDGER_BLOCKED message (see src-tauri/src/wt.rs's
// `ledger_blocked_error_carries_stderr_remedies_first` test): way's verbatim
// risks/remedies, a blank line, then the CLI's instruction line — which
// itself names the CLI-only bypass flags (`--acknowledge`, `--ledger-ack`).
// The dialogue must render this verbatim without offering an in-GUI control
// that performs the bypass for the user.
const LEDGER_BLOCKED_ERROR = {
  code: 'LEDGER_BLOCKED',
  message:
    "critical: uncommitted changes (3 files)\n  remedy: commit or stash them\nwarning: 2 unpushed commits\n  remedy: git push\n\nremoval blocked by the worktree ledger (see above). To proceed, run 'way worktree removal-check --acknowledge' in the worktree and pass the token with --ledger-ack",
}

function mockCommands() {
  mockTauriInvoke.mockImplementation((command: string) => {
    if (command === 'ledger_checkpoint') return Promise.resolve('checkpointed wt_1')
    return Promise.resolve(undefined)
  })
}

function mountDialog(worktree: Worktree | null) {
  return mount(DeleteWorktreeDialog, {
    props: { isOpen: true, worktree, repoName: 'scooda' },
    global: {
      stubs: {
        SModal: { template: '<div><slot /><slot name="footer" /></div>' },
        SButton: { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
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
 * dialogue (buttons, links, inputs). Used to assert no acknowledge/override
 * *control* exists — independent of the verbatim CLI prose rendered
 * elsewhere in the panel, which legitimately contains those words.
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

  it('shows the ledger block with its remedies verbatim and no override control', async () => {
    // Real production path: useWorktrees().removeWorktree() never rejects —
    // it catches internally, records the typed WtError on the worktrees
    // store, and resolves null. The dialogue must read the error from there.
    mockRemoveWorktree.mockImplementationOnce(async () => {
      useWorktreeStore().setError(LEDGER_BLOCKED_ERROR)
      return null
    })
    const wrapper = mountDialog(baseWorktree)

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'Delete Worktree')
    expect(deleteButton).toBeDefined()

    await deleteButton!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('The worktree ledger blocked this removal')
    expect(wrapper.text()).toContain('remedy:')
    expect(wrapper.text()).toContain('Nothing has been deleted')
    // The real CLI prose, rendered verbatim, does name the CLI-only bypass
    // flags — that must NOT fail this check.
    expect(wrapper.text()).toContain('--ledger-ack')
    // What must be true: no interactive control's accessible name offers to
    // acknowledge/override/ledger-ack on the user's behalf.
    const labels = interactiveControlLabels(wrapper)
    expect(labels.some((label) => /acknowledge|override|ledger-ack/i.test(label))).toBe(false)
    wrapper.unmount()
  })

  it('also honours the ledger block when removeWorktree rejects directly', async () => {
    // Fallback path: the dialogue's catch still handles a direct rejection
    // (e.g. a differently-wired caller), not only the resolve-null path.
    mockRemoveWorktree.mockRejectedValueOnce(LEDGER_BLOCKED_ERROR)
    const wrapper = mountDialog(baseWorktree)

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'Delete Worktree')
    await deleteButton!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('The worktree ledger blocked this removal')
    expect(wrapper.text()).toContain('remedy:')
    wrapper.unmount()
  })

  it('marks an unanswerable ledger honestly in the confirm body', () => {
    const wrapper = mountDialog({
      ...baseWorktree,
      ledger: { available: false, unavailable_reason: 'way exited 3' },
    })

    expect(wrapper.text()).toContain('will not be safety-checked')
    wrapper.unmount()
  })

  it('offers "Record a checkpoint first" only when the ledger is available, and invokes it', async () => {
    const wrapper = mountDialog({
      ...baseWorktree,
      ledger: { available: true },
    })

    const checkpointButton = wrapper.findAll('button').find((b) => b.text() === 'Record a checkpoint first')
    expect(checkpointButton).toBeDefined()

    await checkpointButton!.trigger('click')
    await flushPromises()

    const checkpointCalls = mockTauriInvoke.mock.calls.filter((call) => call[0] === 'ledger_checkpoint')
    expect(checkpointCalls).toHaveLength(1)
    expect(checkpointCalls[0][1]).toMatchObject({ path: baseWorktree.path })

    // Does not close the dialogue or trigger a delete
    expect(wrapper.emitted('close')).toBeFalsy()
    expect(mockRemoveWorktree).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows no ledger note when the overlay is absent', () => {
    const wrapper = mountDialog(baseWorktree)

    expect(wrapper.text()).not.toContain('safety-checked')
    const checkpointButton = wrapper.findAll('button').find((b) => b.text() === 'Record a checkpoint first')
    expect(checkpointButton).toBeUndefined()
    wrapper.unmount()
  })
})
