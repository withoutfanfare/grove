<script setup lang="ts">
/**
 * SkeletonList Component
 *
 * Skeleton placeholder matching the RepoList item layout.
 * Shows icon, repository name, and worktree count.
 */
import { SSkeleton } from '@stuntrocket/ui'
</script>

<template>
  <div class="w-full px-3 py-2.5 rounded-lg flex items-center gap-3 border border-transparent">
    <!-- Icon/Avatar skeleton -->
    <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-surface-overlay">
      <SSkeleton width="1rem" height="1rem" />
    </div>

    <!-- Content skeleton -->
    <div class="flex-1 min-w-0 space-y-1.5">
      <!-- Repository name -->
      <SSkeleton width="6rem" height="1rem" />
      <!-- Worktree count -->
      <SSkeleton width="4rem" height="0.75rem" />
    </div>
  </div>
</template>
