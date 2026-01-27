<script setup lang="ts">
/**
 * Toggle Component
 *
 * An iOS-style toggle switch with labels.
 */

interface Props {
  modelValue: boolean
  label?: string
  description?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const toggle = () => {
  if (!props.disabled) {
    emit('update:modelValue', !props.modelValue)
  }
}
</script>

<template>
  <label
    :class="[
      'flex items-start gap-3 cursor-pointer select-none',
      disabled ? 'opacity-50 cursor-not-allowed' : '',
    ]"
  >
    <!-- Toggle track -->
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :class="[
        'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full',
        'transition-colors duration-200 ease-out',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base',
        modelValue ? 'bg-accent' : 'bg-surface-elevated',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
      ]"
      :disabled="disabled"
      @click="toggle"
    >
      <!-- Toggle knob -->
      <span
        :class="[
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm',
          'transform transition-transform duration-200 ease-out',
          'ring-0',
          modelValue ? 'translate-x-5' : 'translate-x-0.5',
        ]"
        style="margin-top: 2px"
      />
    </button>

    <!-- Label and description -->
    <div v-if="label || description" class="flex-1 min-w-0">
      <span v-if="label" class="text-sm font-medium text-text-primary">
        {{ label }}
      </span>
      <p v-if="description" class="text-xs text-text-tertiary mt-0.5">
        {{ description }}
      </p>
    </div>
  </label>
</template>
