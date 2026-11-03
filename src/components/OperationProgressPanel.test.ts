import { it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import OperationProgressPanel from './OperationProgressPanel.vue'

it('shows a failed item’s full, multiline reason without needing a click', () => {
  const reason = 'Removing ~/Herd/scooda-worktrees/fix-deploy-env-guard would lose:\n  - 1 uncommitted change(s):\n      ?? notes.txt\nCommit and push the work, then try again.'
  const wrapper = mount(OperationProgressPanel, {
    props: {
      isOpen: true,
      title: 'Deleting 1 Worktree',
      progress: {
        operation: 'remove_all',
        current: 1,
        total: 1,
        isComplete: true,
        items: [{ item: 'fix/deploy-env-guard', status: 'failed', details: reason, error: reason }],
      },
      hasFailures: true,
    },
    global: { stubs: { SPanel: { template: '<div><slot /><slot name="footer" /></div>' } } },
  })

  expect(wrapper.get('pre').text()).toBe(reason)
})
