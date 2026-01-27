<script setup lang="ts">
/**
 * SkeletonList Component
 *
 * Skeleton placeholder matching the RepoList item layout.
 * Shows icon, repository name, and worktree count.
 */
import Skeleton from './Skeleton.vue'
</script>

<template>
  <div class="w-full px-3 py-2.5 rounded-lg flex items-center gap-3 border border-transparent">
    <!-- Icon/Avatar skeleton -->
    <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-surface-overlay">
      <Skeleton width="w-4" height="h-4" />
    </div>

    <!-- Content skeleton -->
    <div class="flex-1 min-w-0 space-y-1.5">
      <!-- Repository name -->
      <Skeleton width="w-24" height="h-4" />
      <!-- Worktree count -->
      <Skeleton width="w-16" height="h-3" />
    </div>
  </div>
</template>
