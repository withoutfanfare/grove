import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Button from './Button.vue'

describe('Button', () => {
  describe('rendering', () => {
    it('renders slot content', () => {
      const wrapper = mount(Button, {
        slots: {
          default: 'Click Me',
        },
      })
      expect(wrapper.text()).toContain('Click Me')
    })

    it('renders with default variant (secondary)', () => {
      const wrapper = mount(Button)
      expect(wrapper.find('button').classes()).toContain('bg-white/5')
    })

    it('renders with primary variant', () => {
      const wrapper = mount(Button, {
        props: { variant: 'primary' },
      })
      expect(wrapper.find('button').classes()).toContain('bg-accent')
    })

    it('renders with danger variant', () => {
      const wrapper = mount(Button, {
        props: { variant: 'danger' },
      })
      expect(wrapper.find('button').classes()).toContain('bg-danger/10')
    })

    it('renders with success variant', () => {
      const wrapper = mount(Button, {
        props: { variant: 'success' },
      })
      expect(wrapper.find('button').classes()).toContain('bg-success/10')
    })

    it('renders with ghost variant', () => {
      const wrapper = mount(Button, {
        props: { variant: 'ghost' },
      })
      expect(wrapper.find('button').classes()).toContain('bg-transparent')
    })

    it('renders with small size', () => {
      const wrapper = mount(Button, {
        props: { size: 'sm' },
      })
      expect(wrapper.find('button').classes()).toContain('h-7')
    })

    it('renders with medium size (default)', () => {
      const wrapper = mount(Button)
      expect(wrapper.find('button').classes()).toContain('h-9')
    })

    it('renders with large size', () => {
      const wrapper = mount(Button, {
        props: { size: 'lg' },
      })
      expect(wrapper.find('button').classes()).toContain('h-11')
    })
  })

  describe('disabled state', () => {
    it('is disabled when disabled prop is true', () => {
      const wrapper = mount(Button, {
        props: { disabled: true },
      })
      expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    })

    it('is not disabled by default', () => {
      const wrapper = mount(Button)
      expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
    })

    it('does not emit click when disabled', async () => {
      const wrapper = mount(Button, {
        props: { disabled: true },
      })
      await wrapper.find('button').trigger('click')
      expect(wrapper.emitted('click')).toBeUndefined()
    })
  })

  describe('loading state', () => {
    it('shows loading spinner when loading', () => {
      const wrapper = mount(Button, {
        props: { loading: true },
      })
      expect(wrapper.find('svg').exists()).toBe(true)
      expect(wrapper.find('svg').classes()).toContain('animate-spin')
    })

    it('hides slot content when loading', () => {
      const wrapper = mount(Button, {
        props: { loading: true },
        slots: { default: 'Loading...' },
      })
      expect(wrapper.text()).not.toContain('Loading...')
    })

    it('is disabled when loading', () => {
      const wrapper = mount(Button, {
        props: { loading: true },
      })
      expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    })

    it('does not emit click when loading', async () => {
      const wrapper = mount(Button, {
        props: { loading: true },
      })
      await wrapper.find('button').trigger('click')
      expect(wrapper.emitted('click')).toBeUndefined()
    })
  })

  describe('click handling', () => {
    it('emits click event on click', async () => {
      const wrapper = mount(Button)
      await wrapper.find('button').trigger('click')
      expect(wrapper.emitted('click')).toHaveLength(1)
    })

    it('passes mouse event with click', async () => {
      const wrapper = mount(Button)
      await wrapper.find('button').trigger('click')
      const emittedEvent = wrapper.emitted('click')![0][0]
      expect(emittedEvent).toBeInstanceOf(MouseEvent)
    })
  })

  describe('full width', () => {
    it('has full width class when fullWidth is true', () => {
      const wrapper = mount(Button, {
        props: { fullWidth: true },
      })
      expect(wrapper.find('button').classes()).toContain('w-full')
    })

    it('does not have full width class by default', () => {
      const wrapper = mount(Button)
      expect(wrapper.find('button').classes()).not.toContain('w-full')
    })
  })

  describe('keyboard shortcut', () => {
    it('shows shortcut badge when provided', () => {
      const wrapper = mount(Button, {
        props: { shortcut: '⌘K' },
        slots: { default: 'Search' },
      })
      expect(wrapper.find('kbd').exists()).toBe(true)
      expect(wrapper.find('kbd').text()).toBe('⌘K')
    })

    it('does not show shortcut badge when not provided', () => {
      const wrapper = mount(Button)
      expect(wrapper.find('kbd').exists()).toBe(false)
    })

    it('does not show shortcut when loading', () => {
      const wrapper = mount(Button, {
        props: { shortcut: '⌘K', loading: true },
      })
      expect(wrapper.find('kbd').exists()).toBe(false)
    })
  })
})
