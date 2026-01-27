<script setup lang="ts">
/**
 * DropdownItem Component
 *
 * A menu item for dropdown menus with icon support.
 */
withDefaults(defineProps<{
  disabled?: boolean
  danger?: boolean
}>(), {
  disabled: false,
  danger: false
})

const emit = defineEmits<{
  click: []
}>()

function handleClick() {
  emit('click')
}
</script>

<template>
  <button
    @click="handleClick"
    :disabled="disabled"
    :class="[
      'w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors',
      disabled
        ? 'opacity-50 cursor-not-allowed'
        : danger
          ? 'text-danger hover:bg-danger-muted'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface-overlay'
    ]"
  >
    <slot />
  </button>
</template>
