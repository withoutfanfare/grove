<script setup lang="ts">
/**
 * ErrorBoundary Component
 *
 * Catches component errors gracefully and displays user-friendly error messages
 * with retry options. Prevents the entire app from crashing when a component fails.
 */
import { ref, onErrorCaptured } from 'vue'
import { SButton } from '@stuntrocket/ui'

interface Props {
  /** Title shown in the error state */
  title?: string
  /** Description shown in the error state */
  description?: string
  /** Show technical error details (development only) */
  showDetails?: boolean
}

withDefaults(defineProps<Props>(), {
  title: 'Something went wrong',
  description: 'An unexpected error occurred. Please try again.',
  showDetails: false,
})

const emit = defineEmits<{
  error: [error: Error, info: string]
  retry: []
}>()

const hasError = ref(false)
const errorMessage = ref('')
const errorStack = ref('')

// Capture errors from child components
onErrorCaptured((error: Error, _instance, info: string) => {
  hasError.value = true
  errorMessage.value = error.message || 'Unknown error'
  errorStack.value = error.stack || ''

  // Emit the error for logging/reporting
  emit('error', error, info)

  // L9: TODO - Integrate with external error tracking service (e.g., Sentry, Bugsnag)
  // when production telemetry is implemented. This should respect user privacy
  // preferences and only send anonymised error reports if the user opts in.
  // Example integration:
  // if (import.meta.env.PROD && userOptedIn) {
  //   errorTracker.captureException(error, { context: info })
  // }

  // Return false to prevent the error from propagating further
  return false
})

function handleRetry() {
  hasError.value = false
  errorMessage.value = ''
  errorStack.value = ''
  emit('retry')
}
</script>

<template>
  <div v-if="hasError" class="flex items-center justify-center p-6 min-h-[200px]">
    <div class="text-center max-w-md animate-fade-in">
      <!-- Error icon -->
      <div class="w-16 h-16 mx-auto mb-5 rounded-2xl bg-danger-muted flex items-center justify-center">
        <svg class="w-8 h-8 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>

      <!-- Error message -->
      <h3 class="text-lg font-semibold text-text-primary mb-2">
        {{ title }}
      </h3>
      <p class="text-sm text-text-secondary mb-6 leading-relaxed">
        {{ description }}
      </p>

      <!-- Technical details (collapsible) -->
      <Transition
        enter-active-class="transition ease-out duration-150"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
      >
        <details
          v-if="showDetails && errorMessage"
          class="mb-6 text-left bg-surface-overlay rounded-lg border border-white/[0.04] overflow-hidden"
        >
          <summary class="px-4 py-3 text-xs font-medium text-text-tertiary cursor-pointer hover:bg-surface-elevated transition-colors">
            Technical details
          </summary>
          <div class="px-4 py-3 border-t border-white/[0.04] bg-surface-base">
            <p class="text-xs font-mono text-danger mb-2 break-words">
              {{ errorMessage }}
            </p>
            <pre
              v-if="errorStack"
              class="text-2xs font-mono text-text-muted whitespace-pre-wrap break-words max-h-32 overflow-y-auto"
            >{{ errorStack }}</pre>
          </div>
        </details>
      </Transition>

      <!-- Action buttons -->
      <div class="flex items-center justify-center gap-3">
        <SButton variant="primary" @click="handleRetry">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Try Again
        </SButton>
      </div>
    </div>
  </div>

  <!-- Render children when no error -->
  <slot v-else />
</template>
