<script setup lang="ts">
/**
 * Textarea Component
 *
 * Multi-line text input with support for labels, hints, and error states.
 * Used for editing config files and hook scripts.
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label?: string
    placeholder?: string
    hint?: string
    error?: string
    disabled?: boolean
    readonly?: boolean
    rows?: number
    monospace?: boolean
  }>(),
  {
    rows: 6,
    monospace: false,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const hasError = computed(() => !!props.error)

function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
}
</script>

<template>
  <div class="space-y-1.5">
    <!-- Label -->
    <label
      v-if="label"
      class="block text-xs font-medium text-text-secondary"
    >
      {{ label }}
    </label>

    <!-- Textarea -->
    <textarea
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :rows="rows"
      :class="[
        'w-full px-3 py-2 rounded-lg border text-sm transition-colors duration-150 resize-y',
        'bg-background-secondary',
        'placeholder:text-text-muted',
        'focus:outline-none focus:ring-2 focus:ring-offset-0',
        hasError
          ? 'border-danger focus:ring-danger/30 focus:border-danger'
          : 'border-border-primary focus:ring-primary/30 focus:border-primary',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
        readonly ? 'cursor-default bg-background-tertiary' : '',
        monospace ? 'font-mono text-xs leading-relaxed' : '',
      ]"
      @input="handleInput"
    />

    <!-- Hint or Error -->
    <p
      v-if="hint || error"
      :class="[
        'text-2xs',
        hasError ? 'text-danger' : 'text-text-muted',
      ]"
    >
      {{ error || hint }}
    </p>
  </div>
</template>
