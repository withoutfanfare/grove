<script setup lang="ts">
/**
 * SearchInput Component
 *
 * Wraps SSearchInput from @stuntrocket/ui to add:
 * - Debounced emit (avoids excessive filtering on every keystroke)
 * - Keyboard shortcut badge display (e.g. Cmd+F hint when unfocused)
 * - Programmatic focus via defineExpose
 * - Escape key clears and blurs the input
 */
import { ref, watch, computed } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { usePlatform } from '../composables/useKeyboardShortcuts'
import { SSearchInput } from '@stuntrocket/ui'

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

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// Focus state controls shortcut badge visibility
const isFocused = ref(false)

const { formatShortcut } = usePlatform()
const shortcutHint = computed(() => formatShortcut('F'))

// Local value for immediate UI feedback while the debounced emit is pending
const localValue = ref(props.modelValue)

// Ref to the underlying SSearchInput wrapper element for programmatic focus
const searchInputRef = ref<InstanceType<typeof SSearchInput> | null>(null)

// Expose focus() so parent components (e.g. Dashboard keyboard shortcut handler) can focus this input
defineExpose({
  focus: () => {
    const el = searchInputRef.value?.$el?.querySelector('input')
    el?.focus()
  },
})

// Keep local value in sync when the parent updates modelValue externally
watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue !== localValue.value) {
      localValue.value = newValue
    }
  },
)

// Debounced emit — SSearchInput fires on every keystroke, we gate it here
const debouncedEmit = useDebounceFn((value: string) => {
  emit('update:modelValue', value)
}, props.debounceMs)

function handleUpdate(value: string) {
  localValue.value = value
  debouncedEmit(value)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    localValue.value = ''
    emit('update:modelValue', '')
    ;(event.target as HTMLInputElement)?.blur()
    isFocused.value = false
  }
}
</script>

<template>
  <div class="relative" @focusin="isFocused = true" @focusout="isFocused = false">
    <SSearchInput
      ref="searchInputRef"
      :model-value="localValue"
      :placeholder="placeholder"
      :clearable="true"
      @update:model-value="handleUpdate"
      @keydown="handleKeydown"
    />

    <!-- Shortcut badge (Cmd+F) — visible only when the field is empty and unfocused -->
    <div
      v-if="shortcut && !localValue && !isFocused"
      class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none"
    >
      <kbd
        class="hidden sm:inline-flex h-5 items-center gap-0.5 px-1.5 text-[10px] font-medium text-text-tertiary bg-white/5 border border-border-subtle rounded font-sans"
      >
        {{ shortcutHint }}
      </kbd>
    </div>
  </div>
</template>
