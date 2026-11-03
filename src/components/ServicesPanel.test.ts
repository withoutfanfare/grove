import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ServicesPanel from './ServicesPanel.vue'
import { useToast } from '@/composables/useToast'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'

const app = {
  name: 'scooda',
  system_name: 'scooda',
  services: 'horizon',
  supervisor_process: 'scooda-horizon',
  domain: 'scooda.test',
  current_worktree: 'scooda-main',
  supervisor_status: 'RUNNING',
  scheduler_loaded: true,
}
const status = { supervisor_running: true, redis_running: true, apps: [app] }

function mountPanel() {
  return mount(ServicesPanel, {
    props: { isOpen: false },
    global: { stubs: { SPanel: { template: '<div><slot /></div>' } } },
  })
}

const statusCalls = () => mockTauriInvoke.mock.calls.filter((c) => c[0] === 'list_services_status').length

describe('ServicesPanel failures', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetTauriMocks()
    useToast().toasts.value = []
  })

  it('shows the CLI’s own reason when status cannot be read', async () => {
    mockTauriInvoke.mockRejectedValue({ code: 'COMMAND_FAILED', message: 'supervisorctl: connection refused' })
    const wrapper = mountPanel()
    await wrapper.setProps({ isOpen: true })
    await flushPromises()

    expect(wrapper.text()).toContain('supervisorctl: connection refused')
    wrapper.unmount()
  })

  it('re-reads the real service state after a failed action and claims no success', async () => {
    mockTauriInvoke.mockImplementation((command: string) => {
      if (command === 'list_services_status') return Promise.resolve(status)
      if (command === 'run_service_action') return Promise.reject({ code: 'COMMAND_FAILED', message: 'stop failed' })
      return Promise.resolve(undefined)
    })
    const wrapper = mountPanel()
    await wrapper.setProps({ isOpen: true })
    await flushPromises()
    const before = statusCalls()

    await wrapper.findAll('button').find((b) => b.text() === 'Stop')!.trigger('click')
    await flushPromises()

    expect(statusCalls()).toBe(before + 1)
    const { toasts } = useToast()
    expect(toasts.value.some((t) => t.variant === 'success')).toBe(false)
    expect(toasts.value.some((t) => t.variant === 'error' && t.message.includes('stop failed'))).toBe(true)
    wrapper.unmount()
  })

  it('re-reads the real state after a failed worktree switch, since the link may already have moved', async () => {
    mockTauriInvoke.mockImplementation((command: string) => {
      if (command === 'list_services_status') return Promise.resolve(status)
      if (command === 'list_worktrees') {
        return Promise.resolve([
          { path: '/h/scooda-main', branch: 'main', sha: 's', dirty: false, ahead: 0, behind: 0 },
          { path: '/h/scooda-fix', branch: 'fix', sha: 's', dirty: false, ahead: 0, behind: 0 },
        ])
      }
      if (command === 'switch_service_worktree') return Promise.reject({ code: 'COMMAND_FAILED', message: 'config:clear failed' })
      return Promise.resolve(undefined)
    })
    const wrapper = mountPanel()
    await wrapper.setProps({ isOpen: true })
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text() === 'Switch worktree…')!.trigger('click')
    await flushPromises()
    await wrapper.get('select').setValue('scooda-fix')
    const before = statusCalls()

    await wrapper.findAll('button').find((b) => b.text() === 'Switch')!.trigger('click')
    await flushPromises()

    expect(statusCalls()).toBe(before + 1)
    const { toasts } = useToast()
    expect(toasts.value.some((t) => t.variant === 'success')).toBe(false)
    expect(toasts.value.some((t) => t.variant === 'error' && t.message.includes('config:clear failed'))).toBe(true)
    wrapper.unmount()
  })
})
