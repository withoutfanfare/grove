<script setup lang="ts">
/**
 * Dropdown Component
 *
 * A simple dropdown menu with backdrop blur and smooth animations.
 * Uses Teleport to render the menu at document body level, avoiding
 * overflow clipping from parent containers.
 */
import { ref, nextTick, onMounted, onUnmounted } from 'vue'

const { align = 'right' } = defineProps<{
  align?: 'left' | 'right'
}>()

const isOpen = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})

function positionMenu() {
  if (!triggerRef.value) return
  const rect = triggerRef.value.getBoundingClientRect()
  const top = rect.bottom + 4

  if (align === 'right') {
    menuStyle.value = {
      position: 'fixed',
      top: `${top}px`,
      right: `${window.innerWidth - rect.right}px`,
    }
  } else {
    menuStyle.value = {
      position: 'fixed',
      top: `${top}px`,
      left: `${rect.left}px`,
    }
  }
}

async function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    await nextTick()
    positionMenu()
  }
}

function close() {
  isOpen.value = false
}

function handleClickOutside(event: MouseEvent) {
  if (
    isOpen.value &&
    triggerRef.value &&
    dropdownRef.value &&
    !triggerRef.value.contains(event.target as Node) &&
    !dropdownRef.value.contains(event.target as Node)
  ) {
    close()
  }
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && isOpen.value) {
    close()
  }
}

function handleScroll() {
  if (isOpen.value) {
    close()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleEscape)
  document.addEventListener('scroll', handleScroll, true)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleEscape)
  document.removeEventListener('scroll', handleScroll, true)
})

defineExpose({
  close,
  toggle
})
</script>

<template>
  <div class="relative">
    <!-- Trigger -->
    <div ref="triggerRef" @click="toggle">
      <slot name="trigger" />
    </div>

    <!-- Dropdown menu (teleported to body to escape overflow clipping) -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition ease-out duration-100"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition ease-in duration-75"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="isOpen"
          ref="dropdownRef"
          :style="menuStyle"
          class="z-[9999] py-1 min-w-[160px] bg-surface-raised border border-border-subtle rounded-lg shadow-elevated"
        >
          <slot :close="close" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
