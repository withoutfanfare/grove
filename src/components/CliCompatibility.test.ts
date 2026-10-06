import { beforeEach, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GradeBadge from './GradeBadge.vue'
import WorktreeStatusBadges from './WorktreeStatusBadges.vue'
import FileChangesList from './FileChangesList.vue'
import CommitList from './CommitList.vue'
import { useWorktreeFilters } from '../composables/useWorktreeFilters'
import { useStaleDetection } from '../composables/useStaleDetection'
import { useOrphanedDetection } from '../composables/useOrphanedDetection'
import { parseHealthIssueMessage } from '../utils/healthIssues'
import type { Worktree, FileChange } from '../types'
import fixtures from '../../src-tauri/tests/fixtures/cli-pr4.json'

beforeEach(() => setActivePinia(createPinia()))

it('counts untracked-only work as dirty and never suggests it is safe to remove', () => {
  const worktrees = fixtures.ls as Worktree[]
  expect(useWorktreeFilters().countWorktrees(worktrees).dirty).toBe(1)
  expect(useStaleDetection().isSafeToDelete(worktrees[0])).toBe(false)
  expect(useOrphanedDetection().isSafeToDelete(worktrees[0])).toBe(false)
  const badge = mount(WorktreeStatusBadges, { props: { merged: true } })
  expect(badge.html()).not.toContain('safely removed')
})

it('shows base-branch staleness even when upstream is synced, without hard-coding 50', () => {
  const worktree = fixtures.ls[0]
  expect(worktree.behind).toBe(0)
  const badge = mount(WorktreeStatusBadges, { props: worktree })
  expect(badge.text()).toContain('Stale')
  expect(badge.html()).toContain('configured stale threshold')
  expect(badge.html()).not.toContain('50 commits')
})

it('handles an empty worktree list and unknown merge status conservatively', () => {
  expect(useWorktreeFilters().countWorktrees(fixtures['empty-ls'])).toEqual({ all: 0, dirty: 0, stale: 0, unmerged: 0 })
  const worktree = fixtures['missing-base-ls'][0] as Worktree
  expect(useStaleDetection().isSafeToDelete(worktree)).toBe(false)
  const issue = fixtures['missing-base-health'].worktrees[0].issues.find(i => i === 'merge-unknown')!
  expect(parseHealthIssueMessage(issue)[0].scoreImpact).toBe(0)
})

it('renders an unknown grade with score zero using a neutral colour', () => {
  const badge = mount(GradeBadge, { props: { grade: '?', score: 0 } })
  expect(badge.text()).toContain('?')
  expect(badge.attributes('title')).toBe('Health score: 0/100')
  expect(badge.classes()).toContain('text-text-muted')
})

it('renders exact Unicode, quoted, arrow and renamed paths and pipe-bearing commit subjects', () => {
  const files = mount(FileChangesList, { props: { files: fixtures.changes.files as FileChange[], loading: false, error: null } })
  for (const file of fixtures.changes.files) expect(files.text()).toContain(file.path)
  const commits = mount(CommitList, { props: { commits: fixtures.log.commits, loading: false, error: null } })
  expect(commits.text()).toContain('Subject | keeps author intact')
  expect(commits.text()).toContain('Compatibility Test')
})
