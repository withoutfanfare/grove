<script setup lang="ts">
/**
 * PruneConfirmDialog Component (Overview)
 *
 * Mandatory confirmation before the cross-repo "Prune all" bulk action.
 * Lists exactly what will be pruned per repository — pruning deletes
 * merged branches, which cannot be undone.
 */
import { computed } from 'vue'
import { SModal, SButton } from '@stuntrocket/ui'

const props = defineProps<{
  isOpen: boolean
  /** Branches to prune, grouped per repository */
  groups: { repo: string; branches: string[] }[]
  isPruning: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const totalBranches = computed(() =>
  props.groups.reduce((sum, group) => sum + group.branches.length, 0)
)
</script>

<template>
  <SModal :open="isOpen" max-width="max-w-md" @close="emit('close')">
    <template #header>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary">Prune Merged &amp; Stale Worktrees</h2>
    </template>

    <div class="space-y-4">
      <p class="text-sm text-text-secondary">
        This will prune {{ totalBranches }} branch{{ totalBranches === 1 ? '' : 'es' }} across
        {{ groups.length }} repositor{{ groups.length === 1 ? 'y' : 'ies' }}.
        Merged branches are deleted — this cannot be undone.
      </p>

      <div class="space-y-2 max-h-64 overflow-y-auto">
        <div v-for="group in groups" :key="group.repo" class="rounded-lg bg-surface-overlay/50 p-3">
          <p class="text-xs font-semibold text-text-primary mb-1.5">{{ group.repo }}</p>
          <ul class="space-y-0.5">
            <li v-for="branch in group.branches" :key="branch"
              class="text-xs font-mono text-text-secondary truncate">{{ branch }}</li>
          </ul>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <SButton variant="ghost" :disabled="isPruning" @click="emit('close')">Cancel</SButton>
        <SButton variant="danger" :disabled="isPruning" @click="emit('confirm')">
          {{ isPruning ? 'Pruning…' : 'Prune All' }}
        </SButton>
      </div>
    </template>
  </SModal>
</template>
