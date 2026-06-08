import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BatchDeleteDialog from './BatchDeleteDialog.vue'
import type { Worktree } from '../types'

const mk = (branch: string, dirty = false): Worktree => ({
  path: `/r/${branch}`, branch, sha: 's', dirty, ahead: 0, behind: 0,
})

function mountDialog(worktrees: Worktree[]) {
  return mount(BatchDeleteDialog, {
    props: { isOpen: true, worktrees },
    global: {
      stubs: {
        SModal: { template: '<div><slot /><slot name="footer" /></div>' },
        SButton: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
        SCheckbox: {
          props: ['modelValue'],
          template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
        },
      },
    },
  })
}

describe('BatchDeleteDialog', () => {
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

  it('emits confirm with the chosen options', async () => {
    const wrapper = mountDialog([mk('a')])
    // First checkbox is "Delete branches" (default on); toggle "Drop databases" (second)
    const boxes = wrapper.findAll('input[type="checkbox"]')
    await boxes[1].setValue(true) // drop databases
    await wrapper.find('[data-testid="batch-delete-confirm"]').trigger('click')
    const events = wrapper.emitted('confirm')
    expect(events).toBeTruthy()
    expect(events![0][0]).toMatchObject({ deleteBranch: true, dropDb: true, skipBackup: false })
  })
})
