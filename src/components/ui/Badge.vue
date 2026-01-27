<script setup lang="ts">
/**
 * Badge Component
 *
 * A versatile badge/pill component for status indicators, counts, and labels.
 */

interface Props {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent'
  size?: 'sm' | 'md'
  dot?: boolean
  outline?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'md',
  dot: false,
  outline: false,
})

const baseClasses = `
  inline-flex items-center gap-1.5
  font-medium rounded-full
  whitespace-nowrap
`

const variantClasses = {
  default: props.outline
    ? 'bg-transparent text-text-secondary border border-border-default'
    : 'bg-surface-overlay text-text-secondary',
  success: props.outline
    ? 'bg-transparent text-success border border-success/30'
    : 'bg-success-muted text-success',
  warning: props.outline
    ? 'bg-transparent text-warning border border-warning/30'
    : 'bg-warning-muted text-warning',
  danger: props.outline
    ? 'bg-transparent text-danger border border-danger/30'
    : 'bg-danger-muted text-danger',
  info: props.outline
    ? 'bg-transparent text-info border border-info/30'
    : 'bg-info-muted text-info',
  accent: props.outline
    ? 'bg-transparent text-accent border border-accent/30'
    : 'bg-accent-muted text-accent',
}

const sizeClasses = {
  sm: 'px-1.5 py-0.5 text-2xs',
  md: 'px-2 py-0.5 text-xs',
}

const dotColors = {
  default: 'bg-text-tertiary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  accent: 'bg-accent',
}
</script>

<template>
  <span :class="[baseClasses, variantClasses[variant], sizeClasses[size]]">
    <!-- Status dot -->
    <span
      v-if="dot"
      :class="['w-1.5 h-1.5 rounded-full', dotColors[variant]]"
    />

    <!-- Content -->
    <slot />
  </span>
</template>
