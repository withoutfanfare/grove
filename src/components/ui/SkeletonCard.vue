<script setup lang="ts">
/**
 * SkeletonCard Component
 *
 * Skeleton placeholder matching the WorktreeCard layout.
 * Shows branch name, SHA, grade badge, status row, and action buttons area.
 */
import { SSkeleton } from '@stuntrocket/ui'
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
          <SSkeleton width="8rem" height="1.25rem" />
          <!-- SHA badge -->
          <SSkeleton width="3.5rem" height="1.25rem" />
          <!-- Grade badge -->
          <SSkeleton width="2rem" height="1.25rem" />
        </div>

        <!-- Status row -->
        <div class="flex items-center gap-3 mt-1">
          <!-- Status badge -->
          <SSkeleton width="4rem" height="1rem" />
          <!-- Path -->
          <SSkeleton width="6rem" height="0.75rem" />
          <!-- Age -->
          <SSkeleton width="2.5rem" height="0.75rem" />
        </div>
      </div>

      <!-- Right: Actions menu skeleton -->
      <div class="flex-shrink-0">
        <SSkeleton width="2rem" height="2rem" />
      </div>
    </div>
  </div>
</template>
