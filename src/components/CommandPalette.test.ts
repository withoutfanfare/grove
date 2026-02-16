import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CommandPalette from './CommandPalette.vue'
import type { Command } from '@/composables/useCommandRegistry'

function createCommands() {
  const refresh = vi.fn()
  const help = vi.fn()
  const settings = vi.fn()

  const commands: Command[] = [
    {
      id: 'refresh',
      title: 'Refresh',
      category: 'Repository',
      action: refresh,
      shortcut: 'Ctrl+R',
    },
    {
      id: 'help',
      title: 'Help & Documentation',
      category: 'Navigation',
      action: help,
      shortcut: '?',
    },
    {
      id: 'settings',
      title: 'Open Settings',
      category: 'Settings',
      action: settings,
      shortcut: 'Ctrl+,',
    },
  ]

  return { commands, refresh, help, settings }
}

describe('CommandPalette', () => {
  it('executes selected command with keyboard and emits close', async () => {
    const { commands, refresh, help } = createCommands()
    const wrapper = mount(CommandPalette, {
      props: {
        isOpen: true,
        commands,
      },
    })

    const container = wrapper.find('.palette-container')
    await container.trigger('keydown', { key: 'ArrowDown' })
    await container.trigger('keydown', { key: 'Enter' })

    expect(help).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('closes on Escape key', async () => {
    const { commands } = createCommands()
    const wrapper = mount(CommandPalette, {
      props: {
        isOpen: true,
        commands,
      },
    })

    await wrapper.find('.palette-container').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('filters commands by fuzzy query and category', async () => {
    const { commands } = createCommands()
    const wrapper = mount(CommandPalette, {
      props: {
        isOpen: true,
        commands,
      },
    })

    const input = wrapper.find('input.palette-input')
    await input.setValue('navi')
    await nextTick()

    const visibleTitles = wrapper
      .findAll('.palette-item-title')
      .map((item) => item.text())

    expect(visibleTitles).toEqual(['Help & Documentation'])
  })

  it('resets query and selection each time it opens', async () => {
    const { commands } = createCommands()
    const wrapper = mount(CommandPalette, {
      props: {
        isOpen: true,
        commands,
      },
    })

    const input = wrapper.find('input.palette-input')
    const container = wrapper.find('.palette-container')

    await input.setValue('set')
    await container.trigger('keydown', { key: 'ArrowDown' })

    await wrapper.setProps({ isOpen: false })
    await wrapper.setProps({ isOpen: true })
    await nextTick()

    const reopenedInput = wrapper.find('input.palette-input')
    const selectedItems = wrapper.findAll('[data-palette-selected="true"]')

    expect((reopenedInput.element as HTMLInputElement).value).toBe('')
    expect(selectedItems).toHaveLength(1)
    expect(selectedItems[0].text()).toContain('Refresh')
  })
})
