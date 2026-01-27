<script setup lang="ts">
/**
 * VirtualWorktreeList Component
 *
 * Provides virtual scrolling for large worktree lists (50+ items) using
 * @tanstack/vue-virtual. This improves performance by only rendering
 * visible items plus a small overscan buffer.
 *
 * For smaller lists, Dashboard.vue uses TransitionGroup with animations instead.
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { Worktree } from '../types'
import WorktreeCard from './WorktreeCard.vue'

const props = defineProps<{
  worktrees: Worktree[]
  repoName: string
  focusedBranch?: string | null
  expandOnFocus?: boolean
}>()

const emit = defineEmits<{
  delete: [worktree: Worktree]
}>()

// Scroll container reference
const scrollContainerRef = ref<HTMLDivElement | null>(null)

// Estimated item height based on WorktreeCard size (~90px content + 12px gap)
const ESTIMATED_ITEM_HEIGHT = 102
const OVERSCAN_COUNT = 5

// Worktree count as a computed for reactivity
const worktreeCount = computed(() => props.worktrees.length)

// Create virtualizer instance
const virtualizer = useVirtualizer(
  computed(() => ({
    count: worktreeCount.value,
    getScrollElement: () => scrollContainerRef.value,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: OVERSCAN_COUNT,
  }))
)

// Get virtual items for rendering
const virtualItems = computed(() => virtualizer.value.getVirtualItems())

// Total height for the inner container
const totalHeight = computed(() => virtualizer.value.getTotalSize())

// Reset virtualizer when worktrees change (e.g., after filtering)
watch(
  () => props.worktrees.length,
  () => {
    // Scroll to top when list changes significantly (but not if we have a focused branch)
    if (scrollContainerRef.value && !props.focusedBranch) {
      scrollContainerRef.value.scrollTop = 0
    }
  }
)

// Scroll to focused branch when it changes
watch(
  () => props.focusedBranch,
  (branch) => {
    if (branch) {
      const index = props.worktrees.findIndex(wt => wt.branch === branch)
      if (index !== -1) {
        virtualizer.value.scrollToIndex(index, { align: 'center' })
      }
    }
  },
  { immediate: true }
)

// Ensure virtualizer is ready after mount
onMounted(() => {
  // Force a measurement cycle after mount
  virtualizer.value.measure()
})

function handleDelete(worktree: Worktree) {
  emit('delete', worktree)
}
</script>

<template>
  <div
    ref="scrollContainerRef"
    class="virtual-scroll-container"
    tabindex="0"
  >
    <!-- Inner container with total height for scroll area -->
    <div
      class="virtual-scroll-inner"
      :style="{ height: `${totalHeight}px` }"
    >
      <!-- Virtual items positioned absolutely -->
      <div
        v-for="virtualRow in virtualItems"
        :id="`worktree-${worktrees[virtualRow.index].branch}`"
        :key="virtualRow.index"
        :data-index="virtualRow.index"
        class="virtual-scroll-item"
        :style="{
          transform: `translateY(${virtualRow.start}px)`,
        }"
      >
        <WorktreeCard
          :worktree="worktrees[virtualRow.index]"
          :repo-name="repoName"
          :focused="focusedBranch === worktrees[virtualRow.index].branch"
          :initially-expanded="expandOnFocus && focusedBranch === worktrees[virtualRow.index].branch"
          @delete="handleDelete"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.virtual-scroll-container {
  /* Take available height minus header, search, and padding */
  height: calc(100vh - 200px);
  overflow-y: auto;
  overflow-x: hidden;
  /* Smooth scrolling for better UX */
  scroll-behavior: smooth;
  /* Contain scroll within this element */
  contain: strict;
  /* Focus styles for keyboard navigation */
  outline: none;
}

.virtual-scroll-container:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-accent);
  border-radius: var(--radius-lg);
}

.virtual-scroll-inner {
  position: relative;
  width: 100%;
}

.virtual-scroll-item {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  /* Add gap between items */
  padding-bottom: 12px;
}
</style>
