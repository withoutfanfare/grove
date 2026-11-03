import { it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GlobalConfigPanel from './GlobalConfigPanel.vue'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'

beforeEach(() => {
  setActivePinia(createPinia())
  resetTauriMocks()
})

it('names the exact file being edited and where effective settings come from', async () => {
  mockTauriInvoke.mockImplementation((command: string) => {
    if (command === 'read_config_file') {
      return Promise.resolve({
        meta: { layer: 'global', path: '/tmp/alt/groverc', exists: true, writable: true, is_symlink: false },
        content: '',
        entries: [],
      })
    }
    if (command === 'get_config') {
      return Promise.resolve({ protected_branches: [], hooks_enabled: true, herd_root: '/env/herd', config_sources: { HERD_ROOT: 'environment', DEFAULT_BASE: '/tmp/alt/groverc' } })
    }
    return Promise.resolve(undefined)
  })
  const wrapper = mount(GlobalConfigPanel, { props: { isOpen: false } })
  await wrapper.setProps({ isOpen: true })
  await flushPromises()

  const text = wrapper.get('[data-testid="config-provenance"]').text()
  expect(text).toContain('/tmp/alt/groverc')
  expect(text).toContain('Effective HERD_ROOT: /env/herd (from environment)')
  expect(text).toContain('environment variable still wins')
  expect(text).toContain('DEFAULT_BASE: /tmp/alt/groverc')
})
