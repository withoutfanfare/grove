import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorktreeStore } from '../stores'
import { useWt } from './useWt'
import type { Worktree } from '../types'

/**
 * Information about an orphaned worktree
 */
export interface OrphanedWorktreeInfo {
  worktree: Worktree
  repoName: string
  isSafeToDelete: boolean
}

/**
 * Composable for detecting orphaned worktrees.
 *
 * A worktree is considered orphaned when its branch's remote tracking
 * reference has been deleted (typically after a PR merge and branch
 * cleanup on GitHub). Detection runs after background fetch by
 * comparing worktree branches against the remote branches list.
 */
export function useOrphanedDetection() {
  const store = useWorktreeStore()
  const { worktrees } = storeToRefs(store)
  const wt = useWt()

  // Set of branch names known to be orphaned (keyed by `repo:branch`)
  const orphanedBranches = ref<Set<string>>(new Set())

  /**
   * Check all worktree branches against remote branches for a repository.
   * Call this after each background fetch to update orphan status.
   */
  async function detectOrphaned(repoName: string): Promise<void> {
    try {
      const result = await wt.listBranches(repoName)

      // Build set of remote branch names (strip "origin/" prefix)
      const remoteBranchNames = new Set<string>()
      for (const branch of result.branches) {
        if (branch.type === 'remote') {
          // Remote branches come as "origin/feature/foo"
          const name = branch.name.replace(/^origin\//, '')
          remoteBranchNames.add(name)
        }
      }

      // Check each worktree branch
      for (const branch of result.branches) {
        if (branch.type !== 'local') continue
        if (!branch.has_worktree) continue

        const key = `${repoName}:${branch.name}`

        // A branch is orphaned if it has no remote counterpart.
        // Exclude special branches that are typically never orphaned.
        const isMainBranch = ['main', 'master', 'develop', 'development'].includes(branch.name)
        const hasRemote = remoteBranchNames.has(branch.name)

        if (!isMainBranch && !hasRemote) {
          orphanedBranches.value.add(key)
        } else {
          orphanedBranches.value.delete(key)
        }
      }
    } catch {
      // Non-fatal: orphan detection is supplementary
      console.debug(`[useOrphanedDetection] Failed to detect orphans for ${repoName}`)
    }
  }

  /**
   * Check if a specific worktree is orphaned
   */
  function isOrphaned(repoName: string, worktree: Worktree): boolean {
    return orphanedBranches.value.has(`${repoName}:${worktree.branch}`)
  }

  /**
   * Check if an orphaned worktree is safe to delete
   * (merged into base and no uncommitted changes)
   */
  function isSafeToDelete(worktree: Worktree): boolean {
    return worktree.merged === true && !worktree.dirty
  }

  /**
   * Get all orphaned worktrees for the current repository
   */
  const orphanedWorktrees = computed<OrphanedWorktreeInfo[]>(() => {
    const repoName = store.selectedRepoName
    if (!repoName) return []

    return worktrees.value
      .filter(wt => isOrphaned(repoName, wt))
      .map(wt => ({
        worktree: wt,
        repoName,
        isSafeToDelete: isSafeToDelete(wt),
      }))
  })

  /**
   * Count of orphaned worktrees
   */
  const orphanedCount = computed(() => orphanedWorktrees.value.length)

  return {
    detectOrphaned,
    isOrphaned,
    isSafeToDelete,
    orphanedWorktrees,
    orphanedCount,
  }
}
