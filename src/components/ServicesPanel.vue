<script setup lang="ts">
/**
 * ServicesPanel Component
 *
 * Sliding panel showing app service status from `grove services status --json`:
 * Supervisor/Redis daemon health, then each registered app with its Supervisor
 * worker state, scheduler LaunchAgent state, active worktree, and
 * start/stop/restart actions.
 */
import { ref, watch } from 'vue'
import { useWt, useToast } from '../composables'
import { useServicesStore } from '../stores'
import type { ServiceAction, ServiceApp } from '../types'
import { SPanel, SButton, SSkeleton, SSectionHeader } from '@stuntrocket/ui'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useServicesStore()
const wtApi = useWt()
const { toast } = useToast()

const error = ref<string | null>(null)

async function fetchStatus(silent = false) {
  if (!silent) store.setLoading(true)
  error.value = null

  try {
    const result = await wtApi.listServicesStatus()
    store.setStatus(result)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'An unexpected error occurred while fetching service status'
  }

  store.setLoading(false)
}

// Fetch when the panel opens
watch(() => props.isOpen, async (open) => {
  if (open) {
    await fetchStatus()
  }
})

async function runAction(app: ServiceApp, action: ServiceAction) {
  if (store.isActionPending(app.name)) return
  store.setActionPending(app.name, true)
  try {
    await wtApi.runServiceAction(app.name, action)
    toast.success(`${actionLabel(action)} ${app.name}`)
    await fetchStatus(true)
  } catch (e) {
    toast.error(`${app.name}: ${wtApi.toWtError(e).message}`)
  } finally {
    store.setActionPending(app.name, false)
  }
}

function actionLabel(action: ServiceAction): string {
  switch (action) {
    case 'start': return 'Started'
    case 'stop': return 'Stopped'
    case 'restart': return 'Restarted'
  }
}

async function openHorizon(app: ServiceApp) {
  try {
    await wtApi.openInBrowser(`https://${app.domain}/horizon`)
  } catch {
    toast.error('Failed to open Horizon dashboard')
  }
}

function usesHorizon(app: ServiceApp): boolean {
  return app.services.startsWith('horizon')
}

/** Badge styling for the raw supervisorctl state word */
function supervisorBadge(app: ServiceApp): { label: string; classes: string } {
  const state = app.supervisor_status
  if (state == null) {
    return { label: 'No worker', classes: 'bg-surface-overlay text-text-muted' }
  }
  switch (state) {
    case 'RUNNING':
      return { label: 'Running', classes: 'bg-success-muted text-success' }
    case 'STARTING':
      return { label: 'Starting', classes: 'bg-warning-muted text-warning' }
    case 'STOPPED':
    case 'EXITED':
      return { label: 'Stopped', classes: 'bg-surface-overlay text-text-muted' }
    case 'NOT_CONFIGURED':
      return { label: 'Not configured', classes: 'bg-surface-overlay text-text-muted' }
    default:
      // FATAL, BACKOFF, UNKNOWN, ...
      return { label: state.charAt(0) + state.slice(1).toLowerCase(), classes: 'bg-danger-muted text-danger' }
  }
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <SPanel
    :open="isOpen"
    title="Services"
    subtitle="Supervisor · Horizon · Scheduler"
    @close="handleClose"
  >
    <template #icon>
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
      </svg>
    </template>

    <!-- Loading skeleton -->
    <div v-if="store.loading" class="space-y-6">
      <div class="grid grid-cols-2 gap-3">
        <div v-for="i in 2" :key="i" class="rounded-lg p-4 bg-surface-overlay ring-1 ring-inset ring-border-subtle">
          <div class="flex flex-col items-center gap-2">
            <SSkeleton width="4rem" height="1.25rem" />
            <SSkeleton width="5rem" height="0.75rem" />
          </div>
        </div>
      </div>
      <div class="space-y-2">
        <SSkeleton width="4rem" height="0.75rem" />
        <div
          v-for="i in 3"
          :key="i"
          class="flex items-center justify-between p-3 bg-surface-overlay rounded-lg border border-white/[0.04]"
        >
          <div class="space-y-1.5">
            <SSkeleton width="8rem" height="1rem" />
            <SSkeleton width="12rem" height="0.75rem" />
          </div>
          <SSkeleton width="4.5rem" height="1.25rem" />
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="p-4 bg-danger-muted rounded-lg border border-danger/20">
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5 text-danger flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-danger text-sm">{{ error }}</p>
      </div>
    </div>

    <!-- Status -->
    <div v-else class="space-y-6">
      <!-- Daemon health -->
      <div class="grid grid-cols-2 gap-3">
        <div
          :class="store.supervisorRunning ? 'bg-success-muted/50 ring-success/10' : 'bg-danger-muted/50 ring-danger/10'"
          class="rounded-lg p-4 text-center ring-1 ring-inset"
        >
          <p :class="store.supervisorRunning ? 'text-success' : 'text-danger'" class="text-sm font-semibold">
            {{ store.supervisorRunning ? 'Running' : 'Not running' }}
          </p>
          <p class="text-2xs text-text-muted uppercase tracking-wider mt-1">Supervisor</p>
        </div>
        <div
          :class="store.redisRunning ? 'bg-success-muted/50 ring-success/10' : 'bg-danger-muted/50 ring-danger/10'"
          class="rounded-lg p-4 text-center ring-1 ring-inset"
        >
          <p :class="store.redisRunning ? 'text-success' : 'text-danger'" class="text-sm font-semibold">
            {{ store.redisRunning ? 'Running' : 'Not running' }}
          </p>
          <p class="text-2xs text-text-muted uppercase tracking-wider mt-1">Redis</p>
        </div>
      </div>

      <!-- Apps -->
      <section v-if="store.hasApps" class="space-y-3">
        <SSectionHeader title="Apps" :count="store.apps.length" />
        <div class="space-y-2">
          <div
            v-for="app in store.apps"
            :key="app.name"
            class="p-3 bg-surface-overlay rounded-lg border border-white/[0.04] space-y-2.5"
          >
            <!-- App header -->
            <div class="flex items-center gap-3">
              <div class="min-w-0 flex-1">
                <span class="block text-sm text-text-primary font-medium truncate">{{ app.name }}</span>
                <span class="block text-2xs text-text-muted truncate mt-0.5">
                  {{ app.domain }}
                  <template v-if="app.current_worktree"> · <span class="font-mono">{{ app.current_worktree }}</span></template>
                </span>
              </div>
              <span
                :class="supervisorBadge(app).classes"
                class="px-2 py-0.5 text-2xs font-medium rounded-md flex-shrink-0"
                :title="app.supervisor_process || undefined"
              >
                {{ supervisorBadge(app).label }}
              </span>
            </div>

            <!-- Detail line -->
            <div class="flex items-center gap-3 text-2xs text-text-muted">
              <span>{{ app.services === 'none' ? 'No managed services' : app.services }}</span>
              <span>·</span>
              <span>Scheduler {{ app.scheduler_loaded ? 'loaded' : 'not loaded' }}</span>
            </div>

            <!-- Actions -->
            <div v-if="app.services !== 'none'" class="flex flex-wrap items-center gap-1.5">
              <button
                class="service-action"
                :disabled="store.isActionPending(app.name)"
                @click="runAction(app, 'start')"
              >
                Start
              </button>
              <button
                class="service-action"
                :disabled="store.isActionPending(app.name)"
                @click="runAction(app, 'stop')"
              >
                Stop
              </button>
              <button
                class="service-action"
                :disabled="store.isActionPending(app.name)"
                @click="runAction(app, 'restart')"
              >
                Restart
              </button>
              <button
                v-if="usesHorizon(app)"
                class="service-action ml-auto"
                @click="openHorizon(app)"
              >
                Horizon ↗
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Empty state -->
      <div v-else class="p-4 bg-surface-overlay rounded-lg border border-white/[0.04]">
        <p class="text-sm text-text-secondary">No apps registered.</p>
        <p class="text-xs text-text-muted mt-1">
          Register one with <span class="font-mono">grove services add &lt;name&gt;</span> to manage its
          Horizon worker and scheduler here.
        </p>
      </div>

      <SButton variant="secondary" class="w-full" :disabled="store.loading" @click="fetchStatus()">
        Refresh
      </SButton>
    </div>

    <template v-if="!store.loading" #footer>
      <SButton variant="primary" class="w-full" @click="handleClose">
        Done
      </SButton>
    </template>
  </SPanel>
</template>

<style scoped>
.service-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 9px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  transition: background-color 120ms ease, color 120ms ease;
}

.service-action:hover:not(:disabled) {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.07);
}

.service-action:disabled {
  cursor: wait;
  opacity: 0.55;
}
</style>
