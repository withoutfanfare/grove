import { it, expect, beforeEach } from 'vitest'
import { useActivity, recordActivity, redact, resetActivityForTests, MAX_ACTIVITY_ENTRIES } from './useActivity'

beforeEach(() => resetActivityForTests())

it('keeps at most 50 receipts, newest first', () => {
  for (let i = 0; i < MAX_ACTIVITY_ENTRIES + 5; i++) {
    recordActivity({ action: 'Pull', repo: 'demo', target: `branch-${i}`, status: 'succeeded' })
  }
  const { entries } = useActivity()
  expect(entries.value).toHaveLength(50)
  expect(entries.value[0].target).toBe('branch-54')
  expect(entries.value.at(-1)!.target).toBe('branch-5')
})

it('redacts home folders and credentials before storing or copying', () => {
  recordActivity({
    action: 'Pull',
    repo: 'demo',
    target: '/Users/danny/Herd/demo-worktrees/x',
    status: 'failed',
    details: 'fatal: https://danny:ghp_abcdefghijklmnopqrstuvwxyz0123@github.com/x.git DB_PASSWORD=hunter2',
  })
  const { entries, format } = useActivity()
  const text = format(entries.value[0])
  expect(text).toContain('~/Herd/demo-worktrees/x')
  expect(text).not.toMatch(/danny|ghp_|hunter2/)
  expect(entries.value[0].details).not.toContain('hunter2')
  expect(redact('token: abc123')).toBe('token: [redacted]')
  expect(redact('DB_PASSWORD="correct horse battery staple" next')).toBe('DB_PASSWORD=[redacted] next')
  expect(redact('{"password":"hunter2","user":"x"}')).toBe('{"password":[redacted],"user":"x"}')
  expect(redact('DB_PASSWORD="alpha\\"bravo" next')).toBe('DB_PASSWORD=[redacted] next')
  expect(redact('{"password":"hun\\"ter2","user":"x"}')).toBe('{"password":[redacted],"user":"x"}')
})

it('redacts text glued to a quoted credential and values with ambiguous backslashes', () => {
  expect(redact('DB_PASSWORD="alpha"bravo')).toBe('DB_PASSWORD=[redacted]')
  expect(redact(String.raw`DB_PASSWORD='it'\''s-secret' next`)).toBe('DB_PASSWORD=[redacted] next')
  expect(redact("password: 'it''s-secret'")).toBe('password: [redacted]')
  expect(redact(`TOKEN="abc"'def'`)).toBe('TOKEN=[redacted]')
  expect(redact(String.raw`DB_PASSWORD='abc\' API_KEY='second credential'`)).not.toMatch(/second|credential/)
  expect(redact('PASSWORD="abc\\\ndef"')).toBe('PASSWORD=[redacted]')
})

it('redacts multi-line and backslash-ambiguous quoted credentials in full', () => {
  expect(redact("password='it\\'s\nsecond-line'")).toBe('password=[redacted]')
  expect(redact("password='first\nit\\'s secret'")).toBe('password=[redacted]')
  expect(redact(String.raw`PASSWORD="C:\dir\" API_KEY="second credential"`)).toBe('PASSWORD=[redacted]')
  expect(redact('PASSWORD="abc\\\nAPI_KEY="k1 k2"')).toBe('PASSWORD=[redacted]')
  expect(redact('PASSWORD="abc\\\ndef\\\nghi jkl" next')).toBe('PASSWORD=[redacted]')
})

it('does not let a stray quote after a credential swallow later lines', () => {
  expect(redact(`PASSWORD="abc"'\nfetch failed\nit didn't work`)).toBe(`PASSWORD=[redacted]\nfetch failed\nit didn't work`)
})

it('redacts a long run of escaped quotes without stalling', () => {
  const started = Date.now()
  expect(redact('password="' + 'a\\"'.repeat(50_000))).toBe('password=[redacted]')
  expect(Date.now() - started).toBeLessThan(1000)
})

it('keeps a mixed, cancelled batch receipt listing completed, failed and not-started items', async () => {
  const { setActivePinia, createPinia } = await import('pinia')
  setActivePinia(createPinia())
  const { mockTauriInvoke } = await import('@/test/setup')
  const { useWorktrees } = await import('./useWorktrees')
  mockTauriInvoke.mockImplementation((command: string) =>
    command === 'remove_selected_worktrees'
      ? Promise.resolve({
          repo: 'demo',
          worktrees: [
            { branch: 'a', success: true, branch_deleted: false, message: 'removed' },
            { branch: 'b', success: false, branch_deleted: false, message: 'Removal blocked: 1 uncommitted change' },
          ],
          summary: { total: 3, succeeded: 1, failed: 1, cancelled: 1 },
        })
      : Promise.resolve([])
  )
  await useWorktrees().removeSelectedWorktrees('demo', ['a', 'b', 'c'], { deleteBranch: false, dropDb: false, skipBackup: false }, 'op-1')
  const receipt = useActivity().entries.value[0]
  expect(receipt.status).toBe('cancelled')
  expect(receipt.warnings[0]).toBe('1 not started: c')
  expect(receipt.details).toContain('OK  a: removed (branch kept)')
  expect(receipt.details).toContain('FAILED  b: Removal blocked')
})
