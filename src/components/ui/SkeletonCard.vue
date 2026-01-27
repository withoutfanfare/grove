<script setup lang="ts">
/**
 * SkeletonCard Component
 *
 * Skeleton placeholder matching the WorktreeCard layout.
 * Shows branch name, SHA, grade badge, status row, and action buttons area.
 */
import Skeleton from './Skeleton.vue'
</script>

<template>
  <div class="card p-4">
    <!-- Main content row -->
    <div class="flex items-center gap-4">
      <!-- Left: Branch info skeleton -->
      <div class="flex-1 min-w-0">
        <!-- Branch name and metadata row -->
        <div class="flex items-center gap-3">
          <!-- Branch name -->
          <Skeleton width="w-32" height="h-5" />
          <!-- SHA badge -->
          <Skeleton width="w-14" height="h-5" />
          <!-- Grade badge -->
          <Skeleton width="w-8" height="h-5" rounded />
        </div>

        <!-- Status row -->
        <div class="flex items-center gap-3 mt-2">
          <!-- Status badge -->
          <Skeleton width="w-16" height="h-4" />
          <!-- Path -->
          <Skeleton width="w-24" height="h-3" />
        </div>
      </div>

      <!-- Right: Action buttons skeleton -->
      <div class="flex items-center gap-1.5 flex-shrink-0">
        <!-- Navigation group -->
        <div class="flex items-center gap-0.5 p-1 bg-surface-overlay/50 rounded-lg">
          <Skeleton width="w-6" height="h-6" />
          <Skeleton width="w-6" height="h-6" />
          <Skeleton width="w-6" height="h-6" />
          <Skeleton width="w-6" height="h-6" />
        </div>

        <!-- Divider -->
        <div class="divider-vertical h-6 mx-1" />

        <!-- Git actions group -->
        <div class="flex items-center gap-1.5">
          <Skeleton width="w-14" height="h-7" />
          <Skeleton width="w-14" height="h-7" />
          <Skeleton width="w-6" height="h-6" />
        </div>
      </div>
    </div>
  </div>
</template>
