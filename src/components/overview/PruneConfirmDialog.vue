<script setup lang="ts">
/**
 * PruneConfirmDialog Component (Overview)
 *
 * Branch clean-up across repositories, driven by an exact read-only plan per
 * repository (`get_prune_plan`). The dialogue lists the real branches that
 * would be deleted (branches with no worktree, merged into the named base) and
 * deletes only those confirmed names under the plan's ID; the CLI re-checks each
 * one and reports it as deleted, refused or skipped. Worktrees and worktree
 * records are never touched. A repository whose plan failed is never run.
 */
import { ref, computed, watch } from 'vue'
import { SModal, SButton } from '@stuntrocket/ui'
import { useWt, recordActivity } from '../../composables'
import type { PrunePlan, PruneBranchResult } from '../../types'

const props = defineProps<{
  isOpen: boolean
  /** Repositories to plan for */
  repos: string[]
}>()

const emit = defineEmits<{
  close: []
  /** Repositories where something ran, so the parent can refresh them */
  done: [repos: string[]]
}>()

interface RepoPlan {
  repo: string
  plan?: PrunePlan
  error?: string
  results?: PruneBranchResult[]
  executeError?: string
}

const wt = useWt()
const phase = ref<'planning' | 'review' | 'running' | 'results'>('planning')
const plans = ref<RepoPlan[]>([])

const executable = computed(() => plans.value.filter((p) => p.plan && p.plan.branches.length > 0))
const totalTargets = computed(() => executable.value.reduce((sum, p) => sum + p.plan!.branches.length, 0))
const blocked = computed(() => plans.value.filter((p) => p.error))

watch(() => props.isOpen, async (open) => {
  if (!open) return
  phase.value = 'planning'
  plans.value = []
  const loaded: RepoPlan[] = []
  for (const repo of props.repos) {
    try {
      loaded.push({ repo, plan: await wt.getPrunePlan(repo) })
    } catch (error) {
      loaded.push({ repo, error: wt.toWtError(error).message })
    }
  }
  plans.value = loaded
  phase.value = 'review'
}, { immediate: true })

function shortSha(sha?: string) {
  return sha ? sha.slice(0, 7) : 'unknown'
}

function registrationLabel(entry: { path: string; reason?: string }) {
  return entry.reason ? `${entry.path} (${entry.reason})` : entry.path
}

async function handleConfirm() {
  if (phase.value !== 'review' || totalTargets.value === 0) return
  phase.value = 'running'
  for (const entry of executable.value) {
    try {
      const plan = entry.plan!
      const execution = await wt.pruneRepoConfirmed(entry.repo, plan.branches.map((b) => b.name), plan.plan_id)
      entry.results = execution.branches
      const refused = execution.branches.filter((r) => r.status !== 'deleted')
      recordActivity({
        action: `Delete merged branches (base ${plan.base})`,
        repo: entry.repo,
        target: `${plan.branches.length} confirmed branch(es)`,
        status: refused.length === 0 ? 'succeeded' : refused.length === execution.branches.length ? 'failed' : 'partial',
        details: execution.branches.map((r) => `${r.status.toUpperCase()}  ${r.name}${r.reason ? `: ${r.reason}` : ''}`).join('\n'),
      })
    } catch (error) {
      entry.executeError = wt.toWtError(error).message
      recordActivity({ action: 'Delete merged branches', repo: entry.repo, target: `${entry.plan!.branches.length} confirmed branch(es)`, status: 'failed', details: entry.executeError })
    }
  }
  phase.value = 'results'
  emit('done', executable.value.map((p) => p.repo))
}
</script>

<template>
  <SModal :open="isOpen" max-width="max-w-lg" @close="phase !== 'running' && emit('close')">
    <template #header>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary">Delete merged branches</h2>
    </template>

    <div class="space-y-4">
      <p v-if="phase === 'planning'" class="text-sm text-text-secondary" role="status">Checking each repository (read-only)…</p>

      <template v-else>
        <p v-if="phase === 'review'" class="text-sm text-text-secondary">
          <template v-if="totalTargets > 0">
            Deletes exactly these {{ totalTargets }} local branch{{ totalTargets === 1 ? '' : 'es' }}. Each has no
            worktree and is merged into the named base by Git ancestry. Branch clean-up only: worktrees and stale
            worktree records are not touched. Grove re-checks every
            branch before deleting and refuses any that changed. Deleted branches cannot be restored from Grove.
          </template>
          <template v-else>Nothing can be deleted from these plans.</template>
        </p>

        <div class="space-y-2 max-h-72 overflow-y-auto" data-testid="prune-plans">
          <div v-for="entry in plans" :key="entry.repo" class="rounded-lg bg-surface-overlay/50 p-3 space-y-1">
            <p class="text-xs font-semibold text-text-primary">{{ entry.repo }}</p>

            <p v-if="entry.error" class="text-xs text-danger">Exact plan unavailable, nothing will run here: {{ entry.error }}</p>
            <template v-else-if="entry.plan">
              <p class="text-2xs text-text-muted">
                Base {{ entry.plan.base }} @ {{ shortSha(entry.plan.base_sha) }}
                <template v-if="entry.plan.planned_at"> · checked {{ new Date(entry.plan.planned_at).toLocaleTimeString() }}</template>
              </p>
              <ul class="space-y-0.5">
                <li v-for="target in entry.plan.branches" :key="target.name" class="text-xs font-mono text-text-secondary truncate">
                  {{ target.name }} <span class="text-text-muted">@ {{ shortSha(target.sha) }}</span>
                  <template v-for="result in entry.results?.filter((r) => r.name === target.name) ?? []" :key="result.status">
                    <span :class="result.status === 'deleted' ? 'text-success' : 'text-warning'"> — {{ result.status }}</span>
                    <span v-if="result.reason" class="text-text-muted">: {{ result.reason }}</span>
                  </template>
                </li>
                <li v-if="entry.plan.branches.length === 0" class="text-xs text-text-muted">No merged branches without a worktree.</li>
              </ul>
              <p v-if="entry.plan.skipped?.length" class="text-2xs text-text-muted">
                Left alone: {{ entry.plan.skipped.map((s) => `${s.name} (${s.reason})`).join(', ') }}
              </p>
              <p v-if="entry.executeError" class="text-xs text-danger">Clean-up failed: {{ entry.executeError }}</p>
              <p v-if="entry.plan.stale_registrations.length" class="text-2xs text-text-muted">
                Stale worktree records (shown only, not changed):
                {{ entry.plan.stale_registrations.map(registrationLabel).join(', ') }}
              </p>
            </template>
          </div>
        </div>

        <p v-if="blocked.length && phase === 'review'" class="text-xs text-warning">
          {{ blocked.length }} repositor{{ blocked.length === 1 ? 'y has' : 'ies have' }} no trustworthy plan and will be skipped.
        </p>
      </template>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <SButton variant="ghost" :disabled="phase === 'running'" @click="emit('close')">
          {{ phase === 'results' ? 'Close' : 'Cancel' }}
        </SButton>
        <SButton v-if="phase !== 'results'" variant="danger" :disabled="phase !== 'review' || totalTargets === 0" @click="handleConfirm">
          {{ phase === 'running' ? 'Deleting…' : `Delete ${totalTargets} branch${totalTargets === 1 ? '' : 'es'}` }}
        </SButton>
      </div>
    </template>
  </SModal>
</template>
