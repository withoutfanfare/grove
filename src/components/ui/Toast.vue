<script setup lang="ts">
/**
 * Toast Component
 *
 * Single toast notification with icon, message, and optional action.
 * Supports success, error, warning, and info variants with smooth animations.
 */
import type { Toast as ToastType, ToastVariant } from '../../composables/useToast'

const props = defineProps<{
  toast: ToastType
}>()

const emit = defineEmits<{
  dismiss: [id: string]
}>()

const variantConfig: Record<ToastVariant, {
  bg: string
  border: string
  text: string
  icon: string
}> = {
  success: {
    bg: 'bg-surface-raised',
    border: 'border-success/30',
    text: 'text-success',
    icon: 'M5 13l4 4L19 7',
  },
  error: {
    bg: 'bg-surface-raised',
    border: 'border-danger/30',
    text: 'text-danger',
    icon: 'M6 18L18 6M6 6l12 12',
  },
  warning: {
    bg: 'bg-surface-raised',
    border: 'border-warning/30',
    text: 'text-warning',
    icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  },
  info: {
    bg: 'bg-surface-raised',
    border: 'border-info/30',
    text: 'text-info',
    icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
}

const config = variantConfig[props.toast.variant]

function handleDismiss() {
  emit('dismiss', props.toast.id)
}

function handleAction() {
  props.toast.action?.onClick()
  handleDismiss()
}
</script>

<template>
  <div
    :class="[
      'flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg min-w-[280px] max-w-[400px]',
      config.bg,
      config.border,
    ]"
    role="alert"
  >
    <!-- Icon -->
    <div :class="['flex-shrink-0 w-5 h-5 mt-0.5', config.text]">
      <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          :d="config.icon"
        />
      </svg>
    </div>

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <p class="text-sm text-text-primary leading-relaxed">
        {{ toast.message }}
      </p>

      <!-- Action button -->
      <button
        v-if="toast.action"
        class="mt-2 text-xs font-medium text-accent hover:text-accent-hover transition-colors"
        @click="handleAction"
      >
        {{ toast.action.label }}
      </button>
    </div>

    <!-- Dismiss button -->
    <button
      v-if="toast.dismissible"
      class="flex-shrink-0 w-5 h-5 text-text-muted hover:text-text-secondary transition-colors"
      @click="handleDismiss"
      aria-label="Dismiss"
    >
      <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>
