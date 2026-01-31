<script setup lang="ts">
/**
 * Modal Component
 *
 * A premium modal dialog with backdrop blur, animations, and focus trap.
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'

let _uid = 0

interface Props {
  open: boolean
  title?: string
  description?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closable?: boolean
  danger?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  closable: true,
  danger: false,
})

const emit = defineEmits<{
  close: []
}>()


const modalUid = ++_uid
const titleId = computed(() => props.title ? `modal-title-${modalUid}` : undefined)

const modalRef = ref<HTMLElement | null>(null)
const isVisible = ref(false)
const isAnimating = ref(false)

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
}

// Handle open/close with animation
watch(
  () => props.open,
  (newValue) => {
    if (newValue) {
      isVisible.value = true
      isAnimating.value = true
      setTimeout(() => {
        isAnimating.value = false
        // Focus first focusable element in modal
        nextTick(() => {
          if (modalRef.value) {
            const focusable = modalRef.value.querySelector<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
            focusable?.focus()
          }
        })
      }, 250)
    } else {
      isAnimating.value = true
      setTimeout(() => {
        isVisible.value = false
        isAnimating.value = false
      }, 200)
    }
  },
  { immediate: true }
)

// Handle escape key and focus trap
const handleKeydown = (event: KeyboardEvent) => {
  if (!props.open) return

  if (event.key === 'Escape' && props.closable) {
    emit('close')
    return
  }

  // Focus trap: keep Tab within the modal
  if (event.key === 'Tab' && modalRef.value) {
    const focusable = modalRef.value.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }
}

// Handle backdrop click
const handleBackdropClick = (event: MouseEvent) => {
  if (event.target === event.currentTarget && props.closable) {
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
    <Transition name="modal">
      <div
        v-if="isVisible"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @click="handleBackdropClick"
      >
        <!-- Backdrop -->
        <div
          :class="[
            'absolute inset-0 backdrop modal-backdrop-transition',
            props.open ? 'opacity-100' : 'opacity-0',
          ]"
        />

        <!-- Modal -->
        <div
          ref="modalRef"
          :class="[
            'modal relative w-full p-0 overflow-hidden modal-content-transition',
            sizeClasses[size],
            props.open
              ? 'opacity-100 scale-100 translate-y-0'
              : 'opacity-0 scale-95 translate-y-2',
          ]"
          :style="{ transitionDelay: props.open ? '75ms' : '0ms' }"
          role="dialog"
          :aria-labelledby="titleId"
          aria-modal="true"
        >
          <!-- Header -->
          <div
            v-if="title || $slots.header"
            :class="[
              'flex items-start justify-between gap-4 px-6 pt-6 pb-4',
              danger ? 'border-b border-danger/20' : '',
            ]"
          >
            <div class="flex-1 min-w-0">
              <slot name="header">
                <h2
                  :class="[
                    'text-lg font-semibold tracking-tight',
                    danger ? 'text-danger' : 'text-text-primary',
                  ]"
                
                  :id="titleId"
                >
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
              class="flex-shrink-0 p-1.5 -m-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-overlay transition-colors"
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
          <div class="px-6 py-4">
            <slot />
          </div>

          <!-- Footer -->
          <div
            v-if="$slots.footer"
            class="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle bg-surface-base/50"
          >
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Modal transitions using design tokens */
.modal-backdrop-transition {
  transition: opacity var(--duration-modal) var(--ease-out);
}

.modal-content-transition {
  transition: all var(--duration-slow) var(--ease-spring);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--duration-modal) var(--ease-out);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
