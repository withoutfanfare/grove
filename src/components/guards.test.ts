/**
 * Guard tests for the worktree ledger vocabulary.
 *
 * `critical`, `warning` and `informational` are the service's words, not the
 * screen's. Grove drifted from Waypoint's wording exactly this way between
 * Slice 5 and 5.1, and a guard is the only thing that stops it happening again.
 * Waypoint's equivalent lives in `notes/src/components/worktrees/guards.test.ts`.
 *
 * These read *rendered* output rather than source, because the comparisons in
 * `overview.ts` and `AttentionPanel.vue` are logic, not display — they are
 * correct on the raw level and must stay that way. What matters is what reaches
 * a human, so every assertion here checks rendered text plus the attributes a
 * human or a screen reader gets: `title` and `aria-label`.
 */
import { describe, it, expect } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import WorktreeStatusBadges from './WorktreeStatusBadges.vue'
import WorktreeDetailsPanel from './WorktreeDetailsPanel.vue'
import AttentionPanel from './overview/AttentionPanel.vue'
import { useOverviewStore } from '../stores'
import { RAW_LEVEL_NAMES, riskWords } from '../utils/riskVocabulary'
import type { LedgerOverlay, Worktree } from '../types'

const answered = (extra: Partial<LedgerOverlay> = {}): LedgerOverlay => ({
  available: true,
  worktree_id: 'wt_1',
  risk: null,
  risk_available: true,
  risk_unavailable_reason: null,
  removal_blocked: false,
  lease_available: true,
  lease_unavailable_reason: null,
  lease_held: false,
  lease: null,
  checkpoint_at: '2026-08-05T17:00:00Z',
  next_action: null,
  narrative_status: 'present',
  drift: false,
  unavailable_reason: null,
  ...extra,
})

const worktree = (ledger: LedgerOverlay): Worktree => ({
  branch: 'feature/x',
  path: '/tmp/scooda-worktrees/feature-x',
  head: 'abc1234',
  dirty: false,
  ahead: 0,
  behind: 0,
  ledger,
})

/**
 * Everything a human can read out of a mounted component: the visible text, and
 * the two attributes that speak it aloud. A word hidden in a tooltip is still a
 * word the app said.
 */
function humanReadable(wrapper: { text: () => string; findAll: (s: string) => unknown[] }): string {
  const nodes = wrapper.findAll('*') as { attributes: (name: string) => string | undefined }[]
  const spoken = nodes
    .flatMap((node) => [node.attributes('title'), node.attributes('aria-label')])
    .filter((value): value is string => Boolean(value))
  return [wrapper.text(), ...spoken].join(' ').toLowerCase()
}

describe('the ledger vocabulary is the only vocabulary a human reads', () => {
  it.each(RAW_LEVEL_NAMES)('shows no raw level name for %s on a badge', (level) => {
    const wrapper = mount(WorktreeStatusBadges, {
      props: { ledger: answered({ risk: level, removal_blocked: true }) },
    })
    const readable = humanReadable(wrapper)
    expect(readable).toContain(riskWords(level).label.toLowerCase())
    for (const raw of RAW_LEVEL_NAMES) {
      expect(readable).not.toContain(raw)
    }
    wrapper.unmount()
  })

  it.each(RAW_LEVEL_NAMES)('shows no raw level name for %s in the details panel', (level) => {
    const wrapper = mount(WorktreeDetailsPanel, {
      props: {
        worktree: worktree(answered({ risk: level, removal_blocked: true })),
        repoName: 'scooda',
        isExpanded: false,
      },
    })
    const readable = humanReadable(wrapper)
    expect(readable).toContain(riskWords(level).label.toLowerCase())
    for (const raw of RAW_LEVEL_NAMES) {
      expect(readable).not.toContain(raw)
    }
    wrapper.unmount()
  })

  it('shows no raw level name in the attention panel', () => {
    setActivePinia(createPinia())
    const store = useOverviewStore()
    store.snapshots = {
      scooda: {
        repo: 'scooda',
        worktrees: [worktree(answered({ risk: 'critical' }))],
        health: null,
        error: null,
        fetchedAt: Date.now(),
      },
    } as typeof store.snapshots

    const wrapper = mount(AttentionPanel)
    const readable = humanReadable(wrapper)
    expect(readable).toContain(riskWords('critical').label.toLowerCase())
    for (const raw of RAW_LEVEL_NAMES) {
      expect(readable).not.toContain(raw)
    }
    wrapper.unmount()
  })

  it('says what the ledger found rather than saying nothing', () => {
    // A blank verdict is read as "nothing at risk" — a claim. When the check
    // answered and found nothing, Grove makes that claim in words.
    const wrapper = mount(WorktreeStatusBadges, { props: { ledger: answered() } })
    expect(wrapper.text()).toContain('Clear')
    wrapper.unmount()
  })

  it('never renders a risk verdict a null could be mistaken for', () => {
    // `risk: null` with an unanswered check is unknown, never clear. This is the
    // one substitution that would turn "nobody knows" into "safe to delete".
    const wrapper = mount(WorktreeStatusBadges, {
      props: { ledger: answered({ risk: null, risk_available: false }) },
    })
    const text = wrapper.text()
    expect(text).toContain('Risk unknown')
    expect(text).not.toContain('Clear')
    wrapper.unmount()
  })

  it('matches the words Waypoint already ships', () => {
    // Pinned literally. Waypoint's RiskBadge.vue holds the other copy; if either
    // side is edited alone, this fails and the drift is caught in one slice.
    expect(riskWords('critical').label).toBe('At risk')
    expect(riskWords('warning').label).toBe('Needs a look')
    expect(riskWords('informational').label).toBe('Worth knowing')
    expect(riskWords(null).label).toBe('Clear')
  })
})
