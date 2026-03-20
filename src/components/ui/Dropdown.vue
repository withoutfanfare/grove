<script setup lang="ts">
/**
 * Dropdown Component
 *
 * A simple dropdown menu with backdrop blur and smooth animations.
 * Uses Teleport to render the menu at document body level, avoiding
 * overflow clipping from parent containers.
 *
 * Automatically flips to open upward when insufficient space below.
 */
import { ref, nextTick, onMounted, onUnmounted } from 'vue'

const { align = 'right' } = defineProps<{
  align?: 'left' | 'right'
}>()

const isOpen = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})
const opensUpward = ref(false)

const GAP = 4

function positionMenu() {
  if (!triggerRef.value) return
  const rect = triggerRef.value.getBoundingClientRect()
  const menuHeight = dropdownRef.value?.offsetHeight ?? 0
  const spaceBelow = window.innerHeight - rect.bottom - GAP
  const spaceAbove = rect.top - GAP

  // Flip upward if not enough space below but enough above
  opensUpward.value = menuHeight > spaceBelow && spaceAbove > spaceBelow

  const style: Record<string, string> = { position: 'fixed' }

  if (opensUpward.value) {
    style.bottom = `${window.innerHeight - rect.top + GAP}px`
    style.maxHeight = `${spaceAbove}px`
  } else {
    style.top = `${rect.bottom + GAP}px`
    style.maxHeight = `${spaceBelow}px`
  }

  if (align === 'right') {
    style.right = `${window.innerWidth - rect.right}px`
  } else {
    style.left = `${rect.left}px`
  }

  menuStyle.value = style
}

async function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    await nextTick()
    positionMenu()
    // Re-position after render so we have the actual menu height
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

function handleScroll(event: Event) {
  if (!isOpen.value) return
  if (dropdownRef.value && dropdownRef.value.contains(event.target as Node)) return
  positionMenu()
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
          :style="{ ...menuStyle, transformOrigin: (opensUpward ? 'bottom' : 'top') + (align === 'right' ? ' right' : ' left') }"
          class="z-[var(--z-dropdown)] py-1 min-w-[160px] overflow-y-auto bg-surface-raised border border-border-subtle rounded-lg shadow-elevated"
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
