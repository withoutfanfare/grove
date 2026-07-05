import { computed, reactive } from 'vue'
import type { DirtyDetails, DiffStats } from '../types'
import { useWt } from './useWt'

const MAX_CONCURRENT = 4

const diffStats = reactive(new Map<string, DiffStats>())
const dirtyDetails = reactive(new Map<string, DirtyDetails>())
const pendingKeys = new Set<string>()
const queue: Array<() => Promise<void>> = []
let active = 0

function diffKey(path: string, baseBranch?: string): string {
  return `${path}\0${baseBranch ?? ''}`
}

function enqueue(key: string, job: () => Promise<void>) {
  if (pendingKeys.has(key)) return
  pendingKeys.add(key)
  queue.push(async () => {
    try {
      await job()
    } finally {
      pendingKeys.delete(key)
    }
  })
  drainQueue()
}

function drainQueue() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift()!
    active += 1
    void job()
      .catch(() => {
        // Individual diagnostics are supplementary UI only.
      })
      .finally(() => {
        active -= 1
        drainQueue()
      })
  }
}

export function useWorktreeDiagnostics() {
  const wt = useWt()

  function requestDiffStats(path: string, baseBranch?: string) {
    const key = diffKey(path, baseBranch)
    if (diffStats.has(key)) return
    enqueue(`diff:${key}`, async () => {
      try {
        diffStats.set(key, await wt.getDiffStats(path, baseBranch))
      } catch {
        // Supplementary UI only.
      }
    })
  }

  function requestDirtyDetails(path: string) {
    if (dirtyDetails.has(path)) return
    enqueue(`dirty:${path}`, async () => {
      try {
        dirtyDetails.set(path, await wt.getDirtyDetails(path))
      } catch {
        dirtyDetails.delete(path)
      }
    })
  }

  function clearDirtyDetails(path: string) {
    dirtyDetails.delete(path)
  }

  function getDiffStats(path: string, baseBranch?: string) {
    return computed(() => diffStats.get(diffKey(path, baseBranch)))
  }

  function getDirtyDetails(path: string) {
    return computed(() => dirtyDetails.get(path))
  }

  return {
    requestDiffStats,
    requestDirtyDetails,
    clearDirtyDetails,
    getDiffStats,
    getDirtyDetails,
  }
}

export function resetWorktreeDiagnosticsForTests() {
  diffStats.clear()
  dirtyDetails.clear()
  pendingKeys.clear()
  queue.splice(0)
  active = 0
}
