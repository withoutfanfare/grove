<script setup lang="ts">
/**
 * RecentPanel Component (Overview)
 *
 * "Where was I?" — recent worktrees with relative timestamps and
 * editor/terminal quick-open actions. Clicking an entry navigates to the
 * repo with that worktree focused (handled by the parent).
 */
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorktreeStore } from '../../stores'
import { useRecent } from '../../composables'
import { SIconButton, SSkeleton } from '@stuntrocket/ui'

const emit = defineEmits<{
  navigate: [repo: string, branch: string]
  openEditor: [path: string]
  openTerminal: [path: string]
}>()

const store = useWorktreeStore()
const { recentWorktrees, loadingRecent } = storeToRefs(store)
const { fetchRecentWorktrees } = useRecent()

onMounted(() => {
  void fetchRecentWorktrees(10)
})
</script>

<template>
  <section class="recent-panel" aria-label="Recent worktrees">
    <h2 class="recent-title">Recent</h2>

    <!-- Loading skeleton -->
    <ul v-if="loadingRecent && recentWorktrees.length === 0" class="space-y-1.5">
      <li v-for="i in 4" :key="i" class="px-3 py-2.5 rounded-lg bg-surface-overlay/50">
        <div class="space-y-1.5">
          <SSkeleton width="7rem" height="0.9rem" />
          <SSkeleton width="5rem" height="0.7rem" />
        </div>
      </li>
    </ul>

    <!-- Empty state -->
    <div v-else-if="recentWorktrees.length === 0" class="py-10 text-center">
      <div class="w-12 h-12 mx-auto mb-3 rounded-xl bg-surface-overlay flex items-center justify-center">
        <svg class="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p class="text-sm text-text-secondary">No recent worktrees</p>
      <p class="text-2xs text-text-muted mt-1">Worktrees you open will appear here</p>
    </div>

    <!-- Recent list -->
    <ul v-else class="space-y-1.5">
      <li v-for="recent in recentWorktrees" :key="recent.path">
        <div class="group px-3 py-2.5 rounded-lg bg-surface-overlay/50 hover:bg-surface-overlay transition-colors">
          <button class="flex items-start gap-2 w-full text-left"
            @click="emit('navigate', recent.repo, recent.branch)">
            <span :class="[
              'mt-1.5 w-2 h-2 rounded-full flex-shrink-0 transition-colors',
              recent.dirty ? 'bg-warning' : 'bg-success'
            ]" :title="recent.dirty ? 'Uncommitted changes' : 'Clean'" />
            <span class="flex-1 min-w-0">
              <span class="block text-sm font-medium text-text-primary truncate">{{ recent.branch }}</span>
              <span class="block text-[10px] leading-4 text-text-muted truncate mt-0.5">{{ recent.repo }}</span>
              <span class="block text-[10px] leading-4 text-text-muted">{{ recent.accessed_ago }}</span>
            </span>
          </button>

          <div class="flex items-center gap-1 mt-2 opacity-60 group-hover:opacity-100 transition-opacity">
            <SIconButton size="sm" variant="secondary" tooltip="Open in Editor"
              @click="emit('openEditor', recent.path)">
              <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </SIconButton>

            <SIconButton size="sm" tooltip="Open Terminal" @click="emit('openTerminal', recent.path)">
              <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </SIconButton>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.recent-panel {
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.015);
  padding: 16px;
}

.recent-title {
  margin-bottom: 12px;
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
</style>
