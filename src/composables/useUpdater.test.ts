import { it, expect, vi } from 'vitest'
import { mockTauriInvoke } from '@/test/setup'

const check = vi.fn()
vi.mock('@tauri-apps/plugin-updater', () => ({ check: (...args: unknown[]) => check(...args) }))

it('reports a failed update check as failed, not as idle or up to date', async () => {
  const { useUpdater } = await import('./useUpdater')
  check.mockRejectedValueOnce(new Error('network unreachable'))
  const updater = useUpdater()
  await updater.checkForUpdate()
  expect(updater.status.value).toBe('check-failed')
  expect(updater.errorMessage.value).toContain('network unreachable')

  check.mockResolvedValueOnce(null)
  await updater.checkForUpdate()
  expect(updater.status.value).toBe('up-to-date')
  expect(updater.lastCheckedAt.value).not.toBeNull()
})

it('never invents a version number when the lookup fails', async () => {
  const { useUpdater } = await import('./useUpdater')
  mockTauriInvoke.mockRejectedValueOnce({ code: 'IO_ERROR', message: 'nope' })
  const updater = useUpdater()
  await updater.fetchVersion()
  expect(updater.currentVersion.value).toBe('')
  expect(updater.currentVersion.value).not.toBe('0.0.0')
})
