<script setup lang="ts">
/**
 * Panel Component
 *
 * A sliding panel that appears from the right side.
 * Used for detail views, settings, and secondary content.
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'

interface Props {
  open: boolean
  title?: string
  description?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closable?: boolean
  overlay?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  closable: true,
  overlay: true,
})

const emit = defineEmits<{
  close: []
}>()

const isVisible = ref(false)

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
}

// Handle open/close with animation
// Uses --duration-panel token (300ms) for panel close delay
watch(
  () => props.open,
  (newValue) => {
    if (newValue) {
      isVisible.value = true
    } else {
      // Match the CSS transition duration (--duration-panel: 300ms)
      setTimeout(() => {
        isVisible.value = false
      }, 300)
    }
  },
  { immediate: true }
)

// Handle escape key
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && props.open && props.closable) {
    emit('close')
  }
}

// Handle overlay click
const handleOverlayClick = () => {
  if (props.closable) {
    emit('close')
  }
}

// Keyboard listeners
onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isVisible"
      class="fixed inset-0 z-40 flex justify-end overflow-hidden"
    >
      <!-- Overlay -->
      <Transition name="fade">
        <div
          v-if="overlay && open"
          class="absolute inset-0 bg-black/40 backdrop-blur-sm"
          @click="handleOverlayClick"
        />
      </Transition>

      <!-- Panel -->
      <div
        :class="[
          'relative w-full h-full flex flex-col',
          'bg-surface-raised border-l border-border-subtle',
          'shadow-xl panel-slide-transition',
          sizeClasses[size],
          open ? 'translate-x-0' : 'translate-x-full',
        ]"
        role="dialog"
        aria-modal="true"
      >
        <!-- Header -->
        <div
          class="flex-shrink-0 flex items-start justify-between gap-4 px-6 py-5 border-b border-border-subtle"
        >
          <div class="flex-1 min-w-0">
            <slot name="header">
              <h2 class="text-lg font-semibold tracking-tight text-text-primary">
                {{ title }}
              </h2>
              <p v-if="description" class="mt-1 text-sm text-text-tertiary">
                {{ description }}
              </p>
            </slot>
          </div>

          <!-- Close button -->
          <button
            v-if="closable"
            class="flex-shrink-0 p-2 -m-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-overlay transition-colors"
            @click="emit('close')"
          >
            <svg class="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto px-6 py-6">
          <slot />
        </div>

        <!-- Footer -->
        <div
          v-if="$slots.footer"
          class="flex-shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle bg-surface-base/50"
        >
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Panel transitions using design tokens */
.panel-slide-transition {
  transition: transform var(--duration-panel) var(--ease-spring);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--duration-modal) var(--ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
