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
  <div class="card">
    <!-- Main content row -->
    <div class="p-4 flex items-center gap-4">
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
        <div class="flex items-center gap-3 mt-1">
          <!-- Status badge -->
          <Skeleton width="w-16" height="h-4" />
          <!-- Path -->
          <Skeleton width="w-24" height="h-3" />
          <!-- Age -->
          <Skeleton width="w-10" height="h-3" />
        </div>
      </div>

      <!-- Right: Actions menu skeleton -->
      <div class="flex-shrink-0">
        <Skeleton width="w-8" height="h-8" />
      </div>
    </div>
  </div>
</template>
