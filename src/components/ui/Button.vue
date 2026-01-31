<script setup lang="ts">
/**
 * Button Component
 *
 * A premium button component with multiple variants and sizes.
 * Supports icons, loading states, and keyboard shortcuts.
 */

interface Props {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  fullWidth?: boolean
  shortcut?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'secondary',
  size: 'md',
  disabled: false,
  loading: false,
  fullWidth: false,
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
  inline-flex items-center justify-center gap-2
  font-medium rounded-lg
  transition-all duration-150 ease-out
  focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base
  disabled:opacity-50 disabled:cursor-not-allowed
  select-none
`

const variantClasses = {
  primary: `
    bg-accent text-white
    hover:bg-accent-hover shadow-sm
    focus-visible:ring-accent
    active:scale-[0.98]
    border border-transparent
  `,
  secondary: `
    bg-white/5 text-text-primary
    border border-white/10
    hover:bg-white/10 hover:border-white/20
    focus-visible:ring-accent
    active:scale-[0.98]
  `,
  ghost: `
    bg-transparent text-text-secondary
    hover:bg-white/5 hover:text-text-primary
    focus-visible:ring-accent
    active:scale-[0.98]
  `,
  danger: `
    bg-danger/10 text-danger border border-danger/20
    hover:bg-danger/20 hover:border-danger/30
    focus-visible:ring-danger
    active:scale-[0.98]
  `,
  success: `
    bg-success/10 text-success border border-success/20
    hover:bg-success/20 hover:border-success/30
    focus-visible:ring-success
    active:scale-[0.98]
  `,
}

const sizeClasses = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-6 text-base',
}
</script>

<template>
  <button :class="[
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    fullWidth ? 'w-full' : '',
    loading ? 'cursor-wait' : '',
  ]" :disabled="disabled || loading" @click="handleClick">
    <!-- Loading spinner -->
    <svg v-if="loading" class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
      <path class="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>

    <!-- Content -->
    <slot v-if="!loading" />

    <!-- Keyboard shortcut badge -->
    <kbd v-if="shortcut && !loading"
      class="ml-1 px-1.5 py-0.5 text-2xs font-mono bg-surface-base/50 rounded border border-border-subtle">
      {{ shortcut }}
    </kbd>
  </button>
</template>
