import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PruneConfirmDialog from './PruneConfirmDialog.vue'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'
import { resetActivityForTests, useActivity } from '@/composables/useActivity'

const plan = {
  plan_id: 'plan-1',
  repo: 'demo',
  base: 'origin/main',
  base_sha: 'abcdef1234',
  branches: [{ name: 'merged-no-worktree', sha: '1111111' }],
  skipped: [{ name: 'feature/a', reason: 'checked out in a worktree' }],
  stale_registrations: [{ path: '/gone/worktree' }],
}

function mountDialog(repos: string[]) {
  return mount(PruneConfirmDialog, {
    props: { isOpen: true, repos },
    global: {
      stubs: {
        SModal: { template: '<div><slot name="header" /><slot /><slot name="footer" /></div>' },
        SButton: {
          props: ['disabled'],
          template: '<button :data-disabled="disabled ? \'true\' : \'false\'" @click="!disabled && $emit(\'click\')"><slot /></button>',
        },
      },
    },
  })
}

const deleteButton = (w: ReturnType<typeof mountDialog>) => w.findAll('button').find((b) => b.text().startsWith('Delete'))!

describe('PruneConfirmDialog', () => {
  beforeEach(() => {
    resetTauriMocks()
    resetActivityForTests()
  })

  it('shows the exact branches, base and what is left alone, then deletes only those names under the plan ID', async () => {
    mockTauriInvoke.mockImplementation((command: string) => {
      if (command === 'get_prune_plan') return Promise.resolve(plan)
      if (command === 'prune_repo_confirmed') {
        return Promise.resolve({ repo: 'demo', base: 'origin/main', stale_refs_pruned: 0, branches: [{ name: 'merged-no-worktree', status: 'refused', reason: 'branch moved since the plan' }] })
      }
      return Promise.resolve(undefined)
    })
    const wrapper = mountDialog(['demo'])
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('merged-no-worktree')
    expect(text).toContain('origin/main @ abcdef1')
    expect(text).toContain('feature/a (checked out in a worktree)')
    expect(text).toContain('not changed')
    expect(text).toContain('worktrees and stale')
    // A stale (unmerged) worktree is never a target
    expect(text).not.toMatch(/feature\/a\s+@/)

    await deleteButton(wrapper).trigger('click')
    await flushPromises()

    expect(mockTauriInvoke).toHaveBeenCalledWith('prune_repo_confirmed', { repoName: 'demo', branches: ['merged-no-worktree'], planId: 'plan-1' })
    expect(mockTauriInvoke.mock.calls.some((c) => c[0] === 'prune_repo')).toBe(false)
    expect(wrapper.text()).toContain('refused')
    expect(wrapper.text()).toContain('branch moved since the plan')
    expect(useActivity().entries.value[0].status).toBe('failed')
  })

  it('never runs a repository whose plan could not be produced', async () => {
    mockTauriInvoke.mockImplementation((command: string) =>
      command === 'get_prune_plan' ? Promise.reject({ code: 'GIT_ERROR', message: 'for-each-ref failed' }) : Promise.resolve(undefined)
    )
    const wrapper = mountDialog(['demo'])
    await flushPromises()

    expect(wrapper.text()).toContain('Exact plan unavailable')
    expect(wrapper.text()).toContain('for-each-ref failed')
    expect(deleteButton(wrapper).attributes('data-disabled')).toBe('true')
    await deleteButton(wrapper).trigger('click')
    expect(mockTauriInvoke.mock.calls.some((c) => c[0] === 'prune_repo_confirmed')).toBe(false)
  })
})
