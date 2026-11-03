import { it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SettingsPanel from './SettingsPanel.vue'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'

beforeEach(() => {
  setActivePinia(createPinia())
  resetTauriMocks()
})

it('shows exact build provenance in About', async () => {
  mockTauriInvoke.mockImplementation((command: string) =>
    command === 'get_build_info'
      ? Promise.resolve({ appVersion: '0.4.0', appRevision: 'abc1234', cliRevision: 'def5678', cliSha256: 'f'.repeat(64), builtAt: '2026-11-03T09:00:00Z', target: 'aarch64-apple-darwin', protocol: '1' })
      : Promise.resolve(undefined)
  )
  const wrapper = mount(SettingsPanel, { props: { isOpen: false } })
  await wrapper.setProps({ isOpen: true })
  await flushPromises()

  const about = wrapper.get('[data-testid="about-section"]').text()
  expect(about).toContain('abc1234')
  expect(about).toContain('def5678')
  expect(about).toContain('f'.repeat(64))
  expect(about).toContain('aarch64-apple-darwin')
})

it('shows unknown, never a made-up value, when build info is unavailable', async () => {
  mockTauriInvoke.mockRejectedValue({ code: 'COMMAND_FAILED', message: 'not implemented' })
  const wrapper = mount(SettingsPanel, { props: { isOpen: false } })
  await wrapper.setProps({ isOpen: true })
  await flushPromises()

  const about = wrapper.get('[data-testid="about-section"]').text()
  expect(about).toContain('Unknown')
  expect(about).toContain('Build details unavailable: not implemented')
  expect(about).not.toContain('0.0.0')
})
