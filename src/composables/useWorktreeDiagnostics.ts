import { computed, reactive, toValue, type MaybeRefOrGetter } from 'vue'
import type { DirtyDetails, DiffStats } from '../types'
import { useWt } from './useWt'

const MAX_CONCURRENT = 4
/** A diagnostic older than this is re-checked on the next request */
export const DIAGNOSTICS_TTL_MS = 60_000

/** One observation: a value or the reason the check failed, and when it was taken */
export interface DiagnosticEntry<T> {
  value?: T
  error?: string
  checkedAt: number
}

const diffStats = reactive(new Map<string, DiagnosticEntry<DiffStats>>())
const dirtyDetails = reactive(new Map<string, DiagnosticEntry<DirtyDetails>>())
const pendingKeys = new Set<string>()
const queue: Array<() => Promise<void>> = []
let active = 0

// HEAD is part of the key: a new commit or a different base is a different question.
function diffKey(path: string, head: string, baseBranch?: string): string {
  return `${path}\0${head}\0${baseBranch ?? ''}`
}

function isFresh(entry: DiagnosticEntry<unknown> | undefined): boolean {
  return entry !== undefined && Date.now() - entry.checkedAt < DIAGNOSTICS_TTL_MS
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
        // Each job records its own failure.
      })
      .finally(() => {
        active -= 1
        drainQueue()
      })
  }
}

export function useWorktreeDiagnostics() {
  const wt = useWt()

  function requestDiffStats(path: string, head: string, baseBranch?: string) {
    const key = diffKey(path, head, baseBranch)
    if (isFresh(diffStats.get(key))) return
    enqueue(`diff:${key}`, async () => {
      try {
        diffStats.set(key, { value: await wt.getDiffStats(path, baseBranch), checkedAt: Date.now() })
      } catch (error) {
        diffStats.set(key, { error: wt.toWtError(error).message, checkedAt: Date.now() })
      }
    })
  }

  function requestDirtyDetails(path: string) {
    if (isFresh(dirtyDetails.get(path))) return
    enqueue(`dirty:${path}`, async () => {
      try {
        dirtyDetails.set(path, { value: await wt.getDirtyDetails(path), checkedAt: Date.now() })
      } catch (error) {
        dirtyDetails.set(path, { error: wt.toWtError(error).message, checkedAt: Date.now() })
      }
    })
  }

  function clearDirtyDetails(path: string) {
    dirtyDetails.delete(path)
  }

  /** Reactive: follows the worktree's current HEAD and base, never an older key */
  function getDiffStats(
    path: MaybeRefOrGetter<string>,
    head: MaybeRefOrGetter<string>,
    baseBranch: MaybeRefOrGetter<string | undefined>,
  ) {
    return computed(() => diffStats.get(diffKey(toValue(path), toValue(head), toValue(baseBranch))))
  }

  function getDirtyDetails(path: MaybeRefOrGetter<string>) {
    return computed(() => dirtyDetails.get(toValue(path))?.value)
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
