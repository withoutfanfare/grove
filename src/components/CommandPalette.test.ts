import { describe, it, expect, vi, afterEach } from 'vitest'
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
  afterEach(() => {
    document.body.innerHTML = ''
  })

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

  it('exposes dialog and listbox semantics for the selected command', async () => {
    const { commands } = createCommands()
    const wrapper = mount(CommandPalette, {
      props: {
        isOpen: true,
        commands,
      },
    })

    const dialog = wrapper.find('[role="dialog"]')
    const input = wrapper.find('input.palette-input')
    const options = wrapper.findAll('[role="option"]')

    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-label')).toBe('Command palette')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
    expect(input.attributes('role')).toBe('combobox')
    expect(input.attributes('aria-controls')).toBe('palette-listbox')
    expect(input.attributes('aria-activedescendant')).toBe('palette-opt-0')
    expect(options[0].attributes('aria-selected')).toBe('true')

    await dialog.trigger('keydown', { key: 'ArrowDown' })

    expect(input.attributes('aria-activedescendant')).toBe('palette-opt-1')
    expect(options[1].attributes('aria-selected')).toBe('true')
  })

  it('traps Tab focus inside the palette input', async () => {
    const { commands } = createCommands()
    const wrapper = mount(CommandPalette, {
      props: {
        isOpen: true,
        commands,
      },
      attachTo: document.body,
    })
    await nextTick()

    const input = wrapper.find('input.palette-input').element as HTMLInputElement
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    wrapper.find('.palette-container').element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(input)
  })

  it('restores focus to the previously focused element when closed', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()

    const { commands } = createCommands()
    const wrapper = mount(CommandPalette, {
      props: {
        isOpen: true,
        commands,
      },
      attachTo: document.body,
    })
    await nextTick()
    expect(document.activeElement).toBe(wrapper.find('input.palette-input').element)

    await wrapper.setProps({ isOpen: false })
    await nextTick()

    expect(document.activeElement).toBe(opener)
  })
})
