<script setup lang="ts">
/**
 * SearchInput Component
 *
 * A clean search input with magnifying glass icon, clear button,
 * and debounced input for filtering lists.
 */
import { ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'

interface Props {
  modelValue: string
  placeholder?: string
  debounceMs?: number
  shortcut?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Search...',
  debounceMs: 300,
  shortcut: false,
})

// Focus state for shortcut visibility
const isFocused = ref(false)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// Local input value for immediate UI feedback
const localValue = ref(props.modelValue)

// L12: Ref for the input element to enable focus from parent
const inputRef = ref<HTMLInputElement | null>(null)

// L12: Expose focus method for parent components
defineExpose({
  focus: () => inputRef.value?.focus()
})

// Debounced emit for filtering
const debouncedEmit = useDebounceFn((value: string) => {
  emit('update:modelValue', value)
}, props.debounceMs)

// Watch for external changes to modelValue
watch(() => props.modelValue, (newValue) => {
  if (newValue !== localValue.value) {
    localValue.value = newValue
  }
})

function handleInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  localValue.value = value
  debouncedEmit(value)
}

function clearSearch() {
  localValue.value = ''
  emit('update:modelValue', '')
}
</script>

<template>
  <div class="relative">
    <!-- Magnifying glass icon -->
    <div class="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </div>

    <!-- Input field -->
    <!-- L12: Added ref for programmatic focus -->
    <input ref="inputRef" type="text" :value="localValue" :placeholder="placeholder"
      class="w-full pl-10 pr-12 py-2 bg-white/5 text-text-primary border border-white/10 rounded-lg text-sm placeholder:text-text-muted transition-all duration-150 ease-out focus:outline-none focus:bg-white/10 focus:ring-2 focus:ring-offset-0 focus:border-accent/50 focus:ring-accent/20"
      @input="handleInput" @focus="isFocused = true" @blur="isFocused = false" />

    <!-- Shortcut Hint (Cmd+K) - Visible when empty and not focused -->
    <div v-if="!localValue && !isFocused && shortcut"
      class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
      <kbd
        class="hidden sm:inline-flex h-5 items-center gap-0.5 px-1.5 text-[10px] font-medium text-text-tertiary bg-white/5 border border-white/10 rounded font-sans">
        <span class="text-xs">⌘</span>K
      </kbd>
    </div>

    <!-- Clear button -->
    <button v-if="localValue" type="button"
      class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-tertiary hover:text-text-secondary transition-colors rounded-md hover:bg-surface-overlay"
      @click="clearSearch">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>
