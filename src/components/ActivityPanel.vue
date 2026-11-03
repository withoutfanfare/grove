<script setup lang="ts">
/**
 * ActivityPanel Component
 *
 * This session's action receipts (newest first, at most 50): what ran, where,
 * the outcome, warnings and per-item details. Copy is redacted.
 */
import { useActivity, useToast } from '../composables'
import type { ActivityStatus } from '../composables'
import { copyToClipboard } from '../utils/clipboard'
import { SPanel, SButton } from '@stuntrocket/ui'

defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { entries, format, clear } = useActivity()
const { toast } = useToast()

const STATUS_CLASSES: Record<ActivityStatus, string> = {
  succeeded: 'text-success',
  failed: 'text-danger',
  partial: 'text-warning',
  cancelled: 'text-warning',
  warning: 'text-warning',
}

async function copyEntry(entry: Parameters<typeof format>[0]) {
  const result = await copyToClipboard(format(entry))
  if (result.success) toast.success('Details copied (home folder and secrets redacted)')
  else toast.error('Failed to copy details')
}
</script>

<template>
  <SPanel :open="isOpen" title="Activity" subtitle="This session · newest first" @close="emit('close')">
    <div class="space-y-2" data-testid="activity-list">
      <p v-if="entries.length === 0" class="text-sm text-text-muted">
        Nothing yet. Deletes, pulls, syncs, clean-ups and service actions appear here.
      </p>
      <div v-for="entry in entries" :key="entry.id" class="rounded-lg bg-surface-overlay/50 p-3 space-y-1">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm text-text-primary truncate">
            {{ entry.action }}
            <span class="text-xs font-medium uppercase" :class="STATUS_CLASSES[entry.status]">{{ entry.status }}</span>
          </p>
          <span class="text-2xs text-text-muted flex-shrink-0">{{ new Date(entry.at).toLocaleTimeString() }}</span>
        </div>
        <p class="text-xs text-text-muted font-mono truncate" :title="entry.target">{{ entry.repo }} · {{ entry.target }}</p>
        <p v-for="warning in entry.warnings" :key="warning" class="text-xs text-warning">{{ warning }}</p>
        <pre v-if="entry.details" class="text-2xs text-text-secondary whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">{{ entry.details }}</pre>
        <button class="text-2xs text-accent hover:underline" @click="copyEntry(entry)">Copy details</button>
      </div>
    </div>
    <template v-if="entries.length" #footer>
      <SButton variant="ghost" class="w-full" @click="clear">Clear activity</SButton>
    </template>
  </SPanel>
</template>
