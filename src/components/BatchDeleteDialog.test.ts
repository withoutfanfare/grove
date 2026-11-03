import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import BatchDeleteDialog from './BatchDeleteDialog.vue'
import type { Worktree } from '../types'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'

function preflightReturns(verdictFor: (branch: string) => 'clear' | 'blocked' | 'unknown') {
  mockTauriInvoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
    if (command !== 'get_removal_preflight') return Promise.resolve(undefined)
    const verdict = verdictFor(args?.branch as string)
    return Promise.resolve({
      repo: 'grove', branch: args?.branch, path: `/r/${args?.branch}`, verdict,
      checks: [{ id: 'lease', state: verdict, message: verdict === 'clear' ? 'no live session' : 'a live agent session' }],
    })
  })
}

const mk = (branch: string, dirty = false): Worktree => ({
  path: `/r/${branch}`, branch, sha: 's', dirty, ahead: 0, behind: 0,
})

function mountDialog(worktrees: Worktree[]) {
  return mount(BatchDeleteDialog, {
    props: { isOpen: true, worktrees, repoName: 'grove' },
    global: {
      stubs: {
        SModal: { template: '<div><slot /><slot name="footer" /></div>' },
        SButton: { props: ['disabled'], template: '<button :data-disabled="disabled ? \'true\' : \'false\'" @click="$emit(\'click\')"><slot /></button>' },
        SCheckbox: {
          props: ['modelValue'],
          template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
        },
      },
    },
  })
}

describe('BatchDeleteDialog', () => {
  beforeEach(() => {
    resetTauriMocks()
    preflightReturns(() => 'clear')
  })

  it('shows the worktree count in the primary button', () => {
    const wrapper = mountDialog([mk('a'), mk('b'), mk('c')])
    expect(wrapper.text()).toContain('Delete 3')
  })

  it('lists dirty worktrees by name', () => {
    const wrapper = mountDialog([mk('clean'), mk('messy', true)])
    expect(wrapper.text()).toContain('messy')
    expect(wrapper.text()).toMatch(/uncommitted changes/i)
  })

  it('does not warn when nothing is dirty', () => {
    const wrapper = mountDialog([mk('a'), mk('b')])
    expect(wrapper.text()).not.toMatch(/uncommitted changes/i)
  })

  it('emits confirm with the chosen options, keeping branches by default', async () => {
    const wrapper = mountDialog([mk('a')])
    await flushPromises()
    // First checkbox is "Also delete the branches" (default off); toggle "Drop databases" (second)
    const boxes = wrapper.findAll('input[type="checkbox"]')
    await boxes[1].setValue(true) // drop databases
    await flushPromises()
    await wrapper.find('[data-testid="batch-delete-confirm"]').trigger('click')
    const events = wrapper.emitted('confirm')
    expect(events).toBeTruthy()
    expect(events![0][0]).toMatchObject({ deleteBranch: false, dropDb: true, skipBackup: false })
  })

  it('refuses the whole batch while any worktree is blocked or unknown, naming it', async () => {
    preflightReturns((branch) => (branch === 'b' ? 'unknown' : 'clear'))
    const wrapper = mountDialog([mk('a'), mk('b')])
    await flushPromises()

    expect(wrapper.get('[data-testid="batch-preflight"]').text()).toContain('b — a live agent session')
    expect(wrapper.find('[data-testid="batch-delete-confirm"]').attributes('data-disabled')).toBe('true')
    await wrapper.find('[data-testid="batch-delete-confirm"]').trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })
})
