import { expect, it, vi } from 'vitest'
import { useOperationProgress } from './useOperationProgress'
import { mockTauriListen } from '../test/setup'

it('keeps removal refusals as failures even when a branch name contains CONFLICT', async () => {
  let receive!: (event: { payload: unknown }) => void
  mockTauriListen.mockImplementationOnce((_name, listener) => {
    receive = listener
    return Promise.resolve(vi.fn())
  })
  const progress = useOperationProgress()
  const operationId = await progress.startListening('remove_all', ['fix/CONFLICT-banner'])
  receive({ payload: { operation_id: operationId, operation: 'remove_all', current: 1, total: 1, item: 'fix/CONFLICT-banner', status: 'failed', details: 'Removal blocked for fix/CONFLICT-banner: live agent session' } })
  expect(progress.progress.value?.items[0].status).toBe('failed')
  expect(progress.progress.value?.items[0].error).toContain('live agent session')
  await progress.reset()
})

it('applies only events carrying its own operation ID', async () => {
  let receive!: (event: { payload: unknown }) => void
  mockTauriListen.mockImplementationOnce((_name, listener) => {
    receive = listener
    return Promise.resolve(vi.fn())
  })
  const progress = useOperationProgress()
  const operationId = await progress.startListening('pull_all', ['main'])
  // Same operation type and branch, different run: must be ignored
  receive({ payload: { operation_id: 'another-run', operation: 'pull_all', current: 1, total: 1, item: 'main', status: 'failed', details: 'boom' } })
  expect(progress.progress.value?.items[0].status).toBe('pending')
  receive({ payload: { operation_id: operationId, operation: 'pull_all', current: 1, total: 1, item: 'main', status: 'success', details: '' } })
  expect(progress.progress.value?.items[0].status).toBe('success')
  await progress.reset()
})

it('keeps a recovery warning as a warning, never as an item failure', async () => {
  let receive!: (event: { payload: unknown }) => void
  mockTauriListen.mockImplementationOnce((_name, listener) => {
    receive = listener
    return Promise.resolve(vi.fn())
  })
  const progress = useOperationProgress()
  const operationId = await progress.startListening('remove_all', ['a'])
  receive({ payload: { operation_id: operationId, operation: 'remove_all', current: 0, total: 1, item: '', status: 'recovery_unavailable', details: 'Operation continues, recovery is unavailable: disk full' } })
  expect(progress.progress.value?.warnings).toEqual(['Operation continues, recovery is unavailable: disk full'])
  expect(progress.progress.value?.items).toHaveLength(1)
  expect(progress.progress.value?.items[0].status).toBe('pending')
  progress.markStopping()
  expect(progress.progress.value?.stopping).toBe(true)
  await progress.reset()
})

it('completes every detached target independently alongside successful pulls', async () => {
  let receive!: (event: { payload: unknown }) => void
  mockTauriListen.mockImplementationOnce((_name, listener) => {
    receive = listener
    return Promise.resolve(vi.fn())
  })
  const progress = useOperationProgress()
  const operationId = await progress.startListening('pull_all', [])
  for (const [index, item] of ['main', '/worktrees/a', '/worktrees/b'].entries()) {
    receive({ payload: { operation_id: operationId, operation: 'pull_all', current: index + 1, total: 3, item, status: index === 0 ? 'success' : 'failed', details: index === 0 ? '+1 commits' : 'Cannot pull: detached HEAD has no branch' } })
  }
  expect(progress.progress.value?.items).toHaveLength(3)
  expect(progress.progress.value?.isComplete).toBe(true)
  expect(progress.getPercentage()).toBe(100)
  expect(progress.getStatusCounts()).toMatchObject({ success: 1, failed: 2 })
  await progress.reset()
})
