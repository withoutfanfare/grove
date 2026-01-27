<script setup lang="ts">
/**
 * Select Component
 *
 * A styled dropdown select with label and error states.
 */
import { computed } from 'vue'

interface Option {
  value: string
  label: string
  disabled?: boolean
}

interface Props {
  modelValue: string
  options: Option[]
  placeholder?: string
  label?: string
  error?: string
  hint?: string
  disabled?: boolean
  required?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  required: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const selectClasses = computed(() => [
  // Base styles
  'w-full px-3 py-2 pr-10',
  'bg-surface-base text-text-primary',
  'border rounded-lg',
  'text-sm',
  'appearance-none cursor-pointer',
  'transition-all duration-150 ease-out',
  'focus:outline-none focus:ring-2 focus:ring-offset-0',

  // Error state
  props.error
    ? 'border-danger/50 focus:border-danger focus:ring-danger/20'
    : 'border-border-default focus:border-accent focus:ring-accent/20',

  // Disabled state
  props.disabled ? 'opacity-50 cursor-not-allowed' : '',
])
</script>

<template>
  <div class="space-y-1.5">
    <!-- Label -->
    <label v-if="label" class="block text-sm font-medium text-text-secondary">
      {{ label }}
      <span v-if="required" class="text-danger ml-0.5">*</span>
    </label>

    <!-- Select wrapper -->
    <div class="relative">
      <select
        :value="modelValue"
        :disabled="disabled"
        :required="required"
        :class="selectClasses"
        @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      >
        <option v-if="placeholder" value="" disabled>
          {{ placeholder }}
        </option>
        <option
          v-for="option in options"
          :key="option.value"
          :value="option.value"
          :disabled="option.disabled"
        >
          {{ option.label }}
        </option>
      </select>

      <!-- Dropdown arrow -->
      <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-tertiary">
        <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clip-rule="evenodd"
          />
        </svg>
      </div>
    </div>

    <!-- Hint or error -->
    <p v-if="error" class="text-xs text-danger">
      {{ error }}
    </p>
    <p v-else-if="hint" class="text-xs text-text-tertiary">
      {{ hint }}
    </p>
  </div>
</template>
