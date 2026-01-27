<script setup lang="ts">
/**
 * Input Component
 *
 * A styled text input with label, error states, and icons.
 */
import { computed } from 'vue'

interface Props {
  modelValue: string
  type?: 'text' | 'email' | 'password' | 'search' | 'url'
  placeholder?: string
  label?: string
  labelHint?: string
  error?: string
  hint?: string
  disabled?: boolean
  required?: boolean
  autofocus?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  disabled: false,
  required: false,
  autofocus: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputClasses = computed(() => [
  // Base styles
  'w-full px-3 py-2',
  'bg-surface-base text-text-primary',
  'border rounded-lg',
  'text-sm',
  'placeholder:text-text-muted',
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
      <span v-if="labelHint" class="text-text-muted font-normal ml-1">({{ labelHint }})</span>
      <span v-if="required" class="text-danger ml-0.5">*</span>
    </label>

    <!-- Input wrapper -->
    <div class="relative">
      <!-- Leading icon -->
      <div
        v-if="$slots.leading"
        class="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
      >
        <slot name="leading" />
      </div>

      <!-- Input -->
      <input
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        :autofocus="autofocus"
        :class="[
          inputClasses,
          $slots.leading ? 'pl-10' : '',
          $slots.trailing ? 'pr-10' : '',
        ]"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />

      <!-- Trailing icon -->
      <div
        v-if="$slots.trailing"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary"
      >
        <slot name="trailing" />
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
