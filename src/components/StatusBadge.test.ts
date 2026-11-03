import { it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusBadge from './StatusBadge.vue'

it('says "Sync unknown" for null comparison counts, never "Synced"', () => {
  const badge = mount(StatusBadge, { props: { dirty: false, ahead: null, behind: null } })
  expect(badge.text()).toContain('Sync unknown')
  expect(badge.text()).not.toContain('Synced')
  expect(badge.html()).not.toMatch(/Up to date|Level with/)
})

it('shows "Synced" only for two successful zero counts, as of the last fetch', () => {
  const badge = mount(StatusBadge, { props: { dirty: false, ahead: 0, behind: 0 } })
  expect(badge.text()).toContain('Synced')
  expect(badge.html()).toContain('as of the last fetch')
})

it('keeps a known ahead count when the behind count is unknown', () => {
  const badge = mount(StatusBadge, { props: { dirty: false, ahead: 2, behind: null } })
  expect(badge.text()).toContain('2')
  expect(badge.text()).not.toContain('Synced')
})
