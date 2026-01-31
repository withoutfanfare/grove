<script setup lang="ts">
/**
 * Skeleton Component
 *
 * Base skeleton loader with shimmer animation for premium loading states.
 * Use this as a building block for more complex skeleton layouts.
 */

interface Props {
  /** Width class (Tailwind), e.g., 'w-full', 'w-3/4', 'w-24' */
  width?: string
  /** Height class (Tailwind), e.g., 'h-4', 'h-8', 'h-20' */
  height?: string
  /** Make the skeleton circular (for avatars) */
  rounded?: boolean
}

withDefaults(defineProps<Props>(), {
  width: 'w-full',
  height: 'h-4',
  rounded: false,
})
</script>

<template>
  <div
    :class="[
      'skeleton-base',
      width,
      height,
      rounded ? 'rounded-full' : 'rounded-md',
    ]"
  >
    <div class="skeleton-shimmer" />
  </div>
</template>

<style scoped>
.skeleton-base {
  position: relative;
  overflow: hidden;
  background-color: var(--color-surface-overlay);
}

.skeleton-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 25%,
    rgba(255, 255, 255, 0.03) 50%,
    transparent 75%
  );
  background-size: 300% 100%;
  animation: shimmer 2.5s ease-in-out infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
