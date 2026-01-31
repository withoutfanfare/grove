import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Badge from './Badge.vue'

describe('Badge', () => {
  describe('rendering', () => {
    it('renders slot content', () => {
      const wrapper = mount(Badge, {
        slots: { default: 'Badge Text' },
      })
      expect(wrapper.text()).toContain('Badge Text')
    })

    it('renders with default variant', () => {
      const wrapper = mount(Badge)
      expect(wrapper.find('span').classes()).toContain('bg-surface-overlay')
    })

    it('renders with success variant', () => {
      const wrapper = mount(Badge, {
        props: { variant: 'success' },
      })
      expect(wrapper.find('span').classes()).toContain('bg-success-muted')
    })

    it('renders with warning variant', () => {
      const wrapper = mount(Badge, {
        props: { variant: 'warning' },
      })
      expect(wrapper.find('span').classes()).toContain('bg-warning-muted')
    })

    it('renders with danger variant', () => {
      const wrapper = mount(Badge, {
        props: { variant: 'danger' },
      })
      expect(wrapper.find('span').classes()).toContain('bg-danger-muted')
    })

    it('renders with info variant', () => {
      const wrapper = mount(Badge, {
        props: { variant: 'info' },
      })
      expect(wrapper.find('span').classes()).toContain('bg-info-muted')
    })

    it('renders with accent variant', () => {
      const wrapper = mount(Badge, {
        props: { variant: 'accent' },
      })
      expect(wrapper.find('span').classes()).toContain('bg-accent-muted')
    })

    it('renders with small size', () => {
      const wrapper = mount(Badge, {
        props: { size: 'sm' },
      })
      expect(wrapper.find('span').classes()).toContain('text-2xs')
    })

    it('renders with medium size (default)', () => {
      const wrapper = mount(Badge)
      expect(wrapper.find('span').classes()).toContain('text-xs')
    })
  })

  describe('outline variant', () => {
    it('renders outline style for default variant', () => {
      const wrapper = mount(Badge, {
        props: { variant: 'default', outline: true },
      })
      expect(wrapper.find('span').classes()).toContain('bg-transparent')
      expect(wrapper.find('span').classes()).toContain('border')
    })

    it('renders outline style for success variant', () => {
      const wrapper = mount(Badge, {
        props: { variant: 'success', outline: true },
      })
      expect(wrapper.find('span').classes()).toContain('bg-transparent')
      expect(wrapper.find('span').classes()).toContain('border-success/30')
    })

    it('renders outline style for danger variant', () => {
      const wrapper = mount(Badge, {
        props: { variant: 'danger', outline: true },
      })
      expect(wrapper.find('span').classes()).toContain('bg-transparent')
      expect(wrapper.find('span').classes()).toContain('border-danger/30')
    })
  })

  describe('status dot', () => {
    it('does not show dot by default', () => {
      const wrapper = mount(Badge)
      // The dot is a span with w-1.5 and h-1.5 classes
      expect(wrapper.find('span span').exists()).toBe(false)
    })

    it('shows dot when dot prop is true', () => {
      const wrapper = mount(Badge, {
        props: { dot: true },
      })
      // The dot should be a nested span
      expect(wrapper.find('span span').exists()).toBe(true)
    })

    it('has correct dot color for default variant', () => {
      const wrapper = mount(Badge, {
        props: { dot: true, variant: 'default' },
      })
      const dot = wrapper.find('span span')
      expect(dot.classes()).toContain('bg-text-tertiary')
    })

    it('has correct dot color for success variant', () => {
      const wrapper = mount(Badge, {
        props: { dot: true, variant: 'success' },
      })
      const dot = wrapper.find('span span')
      expect(dot.classes()).toContain('bg-success')
    })

    it('has correct dot color for danger variant', () => {
      const wrapper = mount(Badge, {
        props: { dot: true, variant: 'danger' },
      })
      const dot = wrapper.find('span span')
      expect(dot.classes()).toContain('bg-danger')
    })
  })

  describe('combined props', () => {
    it('renders with multiple props', () => {
      const wrapper = mount(Badge, {
        props: { variant: 'success', size: 'sm', dot: true, outline: true },
        slots: { default: 'Active' },
      })
      
      expect(wrapper.text()).toContain('Active')
      expect(wrapper.find('span span').exists()).toBe(true) // dot
      expect(wrapper.find('span').classes()).toContain('bg-transparent') // outline
      expect(wrapper.find('span').classes()).toContain('text-2xs') // small
    })
  })
})
