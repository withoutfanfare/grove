<script setup lang="ts">
/**
 * ToastContainer Component
 *
 * Fixed position container at bottom-right of screen for toast notifications.
 * Stacks multiple toasts vertically with smooth enter/exit animations.
 * Uses Teleport to render at document body level with proper z-index.
 */
import { useToast } from '../../composables/useToast'
import Toast from './Toast.vue'

const { toasts, removeToast } = useToast()

function handleDismiss(id: string) {
  removeToast(id)
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed bottom-6 right-6 z-[100] flex flex-col-reverse gap-3 pointer-events-none"
      aria-live="polite"
      aria-label="Notifications"
    >
      <TransitionGroup
        name="toast"
        tag="div"
        class="flex flex-col-reverse gap-3"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto"
        >
          <Toast
            :toast="toast"
            @dismiss="handleDismiss"
          />
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
/* Toast animations using design tokens - slide in from right, fade out */
.toast-enter-active {
  transition: all var(--duration-toast) var(--ease-spring);
}

.toast-leave-active {
  transition: all var(--duration-modal) var(--ease-out);
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(50%);
}

.toast-move {
  transition: transform var(--duration-toast) var(--ease-spring);
}
</style>
