import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWorktreeSelection } from './useWorktreeSelection'
import { useWorktreeStore } from '../stores'
import { useRepoConfigStore } from '../stores/repoConfig'
import type { Worktree } from '../types'

const mk = (path: string, branch: string, dirty = false): Worktree => ({
  path, branch, sha: 's', dirty, ahead: 0, behind: 0,
})

const list: Worktree[] = [
  mk('/r/a', 'feature/a'),
  mk('/r/b', 'main'),          // protected
  mk('/r/c', 'feature/c', true),
  mk('/r/d', ''),              // detached
]

describe('useWorktreeSelection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const repoConfig = useRepoConfigStore()
    repoConfig.effectiveConfig = {
      protected_branches: ['main', 'release/*'],
    } as any
  })

  it('marks protected and detached worktrees unselectable', () => {
    const sel = useWorktreeSelection()
    expect(sel.isSelectable(list[0])).toBe(true)
    expect(sel.isSelectable(list[1])).toBe(false)
    expect(sel.unselectableReason(list[1])).toMatch(/Protected/)
    expect(sel.isSelectable(list[3])).toBe(false)
    expect(sel.unselectableReason(list[3])).toMatch(/Detached/)
  })

  it('ignores toggle on unselectable worktrees', () => {
    const sel = useWorktreeSelection()
    sel.toggle(list[1], {}, list)
    expect(sel.selectionCount.value).toBe(0)
  })

  it('range select only includes selectable items', () => {
    const sel = useWorktreeSelection()
    sel.toggle(list[0], {}, list)            // anchor on /r/a
    sel.toggle(list[2], { shift: true }, list) // range a..c, skipping protected main
    expect([...useWorktreeStore().selectedPaths].sort()).toEqual(['/r/a', '/r/c'])
  })

  it('select-all toggles the selectable members of the filtered list', () => {
    const sel = useWorktreeSelection()
    expect(sel.selectAllState(list)).toBe('none')
    sel.toggleSelectAll(list)
    expect([...useWorktreeStore().selectedPaths].sort()).toEqual(['/r/a', '/r/c'])
    expect(sel.selectAllState(list)).toBe('all')
    sel.toggleSelectAll(list)
    expect(sel.selectAllState(list)).toBe('none')
  })

  it('reports partial select-all as "some"', () => {
    const sel = useWorktreeSelection()
    sel.toggle(list[0], {}, list)
    expect(sel.selectAllState(list)).toBe('some')
  })

  it('derives selected branches and dirty selections', () => {
    const sel = useWorktreeSelection()
    sel.toggleSelectAll(list)
    expect(sel.selectedBranches(list).sort()).toEqual(['feature/a', 'feature/c'])
    expect(sel.selectedDirty(list).map((w) => w.path)).toEqual(['/r/c'])
  })
})
