<script setup lang="ts">
/**
 * SkeletonText Component
 *
 * Text line skeleton with variable width options.
 * Use for paragraphs, labels, or any text content.
 */
import Skeleton from './Skeleton.vue'

interface Props {
  /** Line count to render */
  lines?: number
  /** Size variant affecting height */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Width pattern: 'full' | 'varied' | 'short' */
  width?: 'full' | 'varied' | 'short'
}

const props = withDefaults(defineProps<Props>(), {
  lines: 1,
  size: 'md',
  width: 'full',
})

const heightClasses = {
  xs: 'h-2.5',
  sm: 'h-3',
  md: 'h-4',
  lg: 'h-5',
}

// Varied widths for multi-line text to look more natural
const variedWidths = ['w-full', 'w-11/12', 'w-4/5', 'w-3/4', 'w-2/3']

function getWidth(index: number): string {
  if (props.width === 'full') return 'w-full'
  if (props.width === 'short') return 'w-1/2'
  // Varied: cycle through widths, last line shorter
  if (index === props.lines - 1 && props.lines > 1) return 'w-2/3'
  return variedWidths[index % variedWidths.length]
}
</script>

<template>
  <div class="space-y-2">
    <Skeleton
      v-for="i in lines"
      :key="i"
      :width="getWidth(i - 1)"
      :height="heightClasses[size]"
    />
  </div>
</template>
