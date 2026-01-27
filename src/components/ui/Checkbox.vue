<script setup lang="ts">
/**
 * Checkbox Component
 *
 * A styled checkbox with label and description.
 */

interface Props {
  modelValue: boolean
  label?: string
  description?: string
  disabled?: boolean
  danger?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  danger: false,
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
      'flex items-start gap-3 cursor-pointer select-none group',
      disabled ? 'opacity-50 cursor-not-allowed' : '',
    ]"
  >
    <!-- Checkbox -->
    <div class="flex-shrink-0 mt-0.5">
      <button
        type="button"
        role="checkbox"
        :aria-checked="modelValue"
        :class="[
          'w-4 h-4 rounded',
          'border',
          'flex items-center justify-center',
          'transition-all duration-150 ease-out',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base',
          modelValue
            ? danger
              ? 'bg-danger border-danger focus-visible:ring-danger'
              : 'bg-accent border-accent focus-visible:ring-accent'
            : 'bg-surface-base border-border-default group-hover:border-border-strong focus-visible:ring-accent',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        ]"
        :disabled="disabled"
        @click="toggle"
      >
        <!-- Checkmark -->
        <svg
          v-if="modelValue"
          class="w-3 h-3 text-white"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            d="M2 6l3 3 5-6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <!-- Label and description -->
    <div v-if="label || description" class="flex-1 min-w-0">
      <span
        :class="[
          'text-sm font-medium',
          danger && modelValue ? 'text-danger' : 'text-text-primary',
        ]"
      >
        {{ label }}
      </span>
      <p v-if="description" class="text-xs text-text-tertiary mt-0.5">
        {{ description }}
      </p>
    </div>
  </label>
</template>
