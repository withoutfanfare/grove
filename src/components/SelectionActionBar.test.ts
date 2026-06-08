import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SelectionActionBar from './SelectionActionBar.vue'

function mountBar(count: number) {
  return mount(SelectionActionBar, { props: { count } })
}

describe('SelectionActionBar', () => {
  it('renders nothing when count is 0', () => {
    const wrapper = mountBar(0)
    expect(wrapper.find('[data-testid="selection-action-bar"]').exists()).toBe(false)
  })

  it('shows the selected count', () => {
    const wrapper = mountBar(3)
    expect(wrapper.text()).toContain('3 selected')
  })

  it('emits pull, delete, and clear', async () => {
    const wrapper = mountBar(2)
    await wrapper.find('[data-testid="bar-pull"]').trigger('click')
    await wrapper.find('[data-testid="bar-delete"]').trigger('click')
    await wrapper.find('[data-testid="bar-clear"]').trigger('click')
    expect(wrapper.emitted('pull')).toBeTruthy()
    expect(wrapper.emitted('delete')).toBeTruthy()
    expect(wrapper.emitted('clear')).toBeTruthy()
  })
})
