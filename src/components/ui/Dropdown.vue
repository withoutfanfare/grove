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
      <Transition name="dropdown">
        <div
          v-if="isOpen"
          ref="dropdownRef"
          :style="{ ...menuStyle, transformOrigin: align === 'right' ? 'top right' : 'top left' }"
          class="z-[var(--z-dropdown)] py-1 min-w-[160px] bg-surface-raised border border-border-subtle rounded-lg shadow-elevated"
        >
          <slot :close="close" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.dropdown-enter-active {
  transition: opacity var(--duration-normal) var(--ease-spring),
    transform var(--duration-normal) var(--ease-spring);
}

.dropdown-leave-active {
  transition: opacity var(--duration-fast) var(--ease-out),
    transform var(--duration-fast) var(--ease-out);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
