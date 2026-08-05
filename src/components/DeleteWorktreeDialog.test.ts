import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DeleteWorktreeDialog from './DeleteWorktreeDialog.vue'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'
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

describe('DeleteWorktreeDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetTauriMocks()
    mockCommands()
    mockRemoveWorktree.mockReset()
  })

  it('shows the ledger block with its remedies verbatim and no override control', async () => {
    mockRemoveWorktree.mockRejectedValueOnce({
      code: 'LEDGER_BLOCKED',
      message:
        'critical: repo has uncommitted planning notes\n  remedy: run `way checkpoint` before removing\n\nremoval blocked by the worktree ledger — resolve the risk above and try again.',
    })
    const wrapper = mountDialog(baseWorktree)
    await flushPromises()

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'Delete Worktree')
    expect(deleteButton).toBeDefined()

    await deleteButton!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('The worktree ledger blocked this removal')
    expect(wrapper.text()).toContain('remedy:')
    expect(wrapper.text()).toContain('Nothing has been deleted')
    // the whole dialogue offers no acknowledge/override path
    expect(wrapper.html()).not.toMatch(/acknowledge|override|--ledger-ack/i)
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
