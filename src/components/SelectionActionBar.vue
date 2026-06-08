<script setup lang="ts">
/**
 * SelectionActionBar
 *
 * Floating bar shown at the bottom of the worktree list when one or more
 * worktrees are selected. Exposes batch Pull, Delete, and Clear actions.
 */
const props = defineProps<{
  count: number
}>()

const emit = defineEmits<{
  pull: []
  delete: []
  clear: []
}>()

void props
</script>

<template>
  <Transition name="action-bar">
    <div
      v-if="count > 0"
      data-testid="selection-action-bar"
      class="selection-action-bar"
    >
      <span class="selection-count">{{ count }} selected</span>

      <div class="flex-1" />

      <button class="bar-action" data-testid="bar-pull" title="Pull selected worktrees" @click="emit('pull')">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Pull
      </button>

      <button class="bar-action bar-action-danger" data-testid="bar-delete" title="Delete selected worktrees" @click="emit('delete')">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Delete
      </button>

      <span class="bar-divider" />

      <button class="bar-action" data-testid="bar-clear" title="Clear selection (Esc)" @click="emit('clear')">
        Clear
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.selection-action-bar {
  position: absolute;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  z-index: 90;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 360px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(17, 24, 39, 0.96);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
}

.selection-count {
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.bar-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  transition: background-color var(--duration-fast, 120ms) ease, color var(--duration-fast, 120ms) ease;
}

.bar-action:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.07);
}

.bar-action-danger {
  color: var(--color-danger);
  border-color: color-mix(in srgb, var(--color-danger) 30%, transparent);
  background: color-mix(in srgb, var(--color-danger) 14%, transparent);
}

.bar-action-danger:hover {
  background: color-mix(in srgb, var(--color-danger) 22%, transparent);
}

.bar-divider {
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.08);
}

.action-bar-enter-active,
.action-bar-leave-active {
  transition: opacity var(--duration-modal) var(--ease-out), transform var(--duration-modal) var(--ease-out);
}

.action-bar-enter-from,
.action-bar-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}
</style>
