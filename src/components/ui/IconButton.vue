<script setup lang="ts">
/**
 * IconButton Component
 *
 * A compact button for icon-only actions with tooltip support.
 * Used for action bars and toolbars.
 */

interface Props {
  variant?: 'ghost' | 'secondary' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  tooltip?: string
  active?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'ghost',
  size: 'md',
  disabled: false,
  loading: false,
  active: false,
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const handleClick = (event: MouseEvent) => {
  if (!props.disabled && !props.loading) {
    emit('click', event)
  }
}

const baseClasses = `
  inline-flex items-center justify-center
  rounded-lg
  transition-all duration-150 ease-out
  focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base focus-visible:ring-accent
  disabled:opacity-50 disabled:cursor-not-allowed
  select-none
`

const variantClasses = {
  ghost: `
    bg-transparent text-text-tertiary
    hover:bg-surface-overlay hover:text-text-primary
    active:scale-95
  `,
  secondary: `
    bg-surface-overlay text-text-secondary
    border border-border-subtle
    hover:bg-surface-elevated hover:text-text-primary hover:border-border-default
    active:scale-95
  `,
  danger: `
    bg-transparent text-text-tertiary
    hover:bg-danger-muted hover:text-danger
    active:scale-95
  `,
  success: `
    bg-transparent text-text-tertiary
    hover:bg-success-muted hover:text-success
    active:scale-95
  `,
}

const activeClasses = {
  ghost: 'bg-surface-overlay text-text-primary',
  secondary: 'bg-surface-elevated text-text-primary border-border-default',
  danger: 'bg-danger-muted text-danger',
  success: 'bg-success-muted text-success',
}

const sizeClasses = {
  sm: 'w-7 h-7',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
}

const iconSizeClasses = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
}
</script>

<template>
  <button
    :class="[
      baseClasses,
      variantClasses[variant],
      active ? activeClasses[variant] : '',
      sizeClasses[size],
      loading ? 'cursor-wait' : '',
    ]"
    :disabled="disabled || loading"
    :title="tooltip"
    @click="handleClick"
  >
    <!-- Loading spinner -->
    <svg
      v-if="loading"
      :class="['animate-spin', iconSizeClasses[size]]"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        class="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="3"
      />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>

    <!-- Icon slot -->
    <span v-else :class="iconSizeClasses[size]">
      <slot />
    </span>
  </button>
</template>
