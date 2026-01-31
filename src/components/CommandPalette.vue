<script setup lang="ts">
/**
 * CommandPalette Component
 *
 * A Raycast-style command palette triggered by Cmd+K.
 * Provides fuzzy search over global and contextual actions.
 */
import { ref, computed, watch, nextTick } from 'vue'
import type { Command } from '../composables/useCommandRegistry'

const props = defineProps<{
  isOpen: boolean
  commands: Command[]
}>()

const emit = defineEmits<{
  close: []
}>()

const query = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

// Fuzzy match: check if all query chars appear in order in the target
function fuzzyMatch(target: string, q: string): { match: boolean; score: number } {
  const lower = target.toLowerCase()
  const qLower = q.toLowerCase()
  let qi = 0
  let score = 0
  let prevMatchIndex = -1

  for (let i = 0; i < lower.length && qi < qLower.length; i++) {
    if (lower[i] === qLower[qi]) {
      // Consecutive matches score higher
      if (prevMatchIndex === i - 1) score += 2
      // Word boundary matches score higher
      if (i === 0 || target[i - 1] === ' ') score += 3
      score += 1
      prevMatchIndex = i
      qi++
    }
  }

  return { match: qi === qLower.length, score }
}

const filtered = computed(() => {
  const q = query.value.trim()
  if (!q) return props.commands

  return props.commands
    .map((cmd) => {
      const titleMatch = fuzzyMatch(cmd.title, q)
      const catMatch = fuzzyMatch(cmd.category, q)
      const best = titleMatch.score >= catMatch.score ? titleMatch : catMatch
      return { cmd, match: titleMatch.match || catMatch.match, score: best.score }
    })
    .filter((r) => r.match)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.cmd)
})

// Group by category
const grouped = computed(() => {
  const groups: { category: string; items: Command[] }[] = []
  const seen = new Map<string, Command[]>()

  for (const cmd of filtered.value) {
    let arr = seen.get(cmd.category)
    if (!arr) {
      arr = []
      seen.set(cmd.category, arr)
      groups.push({ category: cmd.category, items: arr })
    }
    arr.push(cmd)
  }
  return groups
})

// Flat list for keyboard navigation
const flatList = computed(() => filtered.value)

// Reset state when opened
watch(() => props.isOpen, (open) => {
  if (open) {
    query.value = ''
    selectedIndex.value = 0
    nextTick(() => inputRef.value?.focus())
  }
})

// Reset selection when filter changes
watch(filtered, () => {
  selectedIndex.value = 0
})

function executeCommand(cmd: Command) {
  emit('close')
  cmd.action()
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value + 1) % Math.max(1, flatList.value.length)
    scrollToSelected()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value - 1 + flatList.value.length) % Math.max(1, flatList.value.length)
    scrollToSelected()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const cmd = flatList.value[selectedIndex.value]
    if (cmd) executeCommand(cmd)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

function scrollToSelected() {
  nextTick(() => {
    const el = document.querySelector('[data-palette-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  })
}

// Track cumulative index for flat navigation across groups
function getFlatIndex(groupIndex: number, itemIndex: number): number {
  let idx = 0
  for (let g = 0; g < groupIndex; g++) {
    idx += grouped.value[g].items.length
  }
  return idx + itemIndex
}
</script>

<template>
  <Teleport to="body">
    <Transition name="palette">
      <div v-if="isOpen" class="palette-overlay" @mousedown.self="emit('close')">
        <div class="palette-container" @keydown="handleKeydown">
          <!-- Search input -->
          <div class="palette-input-wrapper">
            <svg class="palette-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              class="palette-input"
              placeholder="Type a command…"
              autocomplete="off"
              spellcheck="false"
            />
            <kbd class="palette-esc-hint">ESC</kbd>
          </div>

          <!-- Results -->
          <div class="palette-results">
            <div v-if="flatList.length === 0" class="palette-empty">
              No matching commands
            </div>

            <template v-for="(group, gi) in grouped" :key="group.category">
              <div class="palette-group-header">{{ group.category }}</div>
              <button
                v-for="(cmd, ci) in group.items"
                :key="cmd.id"
                :data-palette-selected="getFlatIndex(gi, ci) === selectedIndex"
                :class="[
                  'palette-item',
                  getFlatIndex(gi, ci) === selectedIndex && 'palette-item--selected'
                ]"
                @click="executeCommand(cmd)"
                @mouseenter="selectedIndex = getFlatIndex(gi, ci)"
              >
                <span class="palette-item-title">{{ cmd.title }}</span>
                <kbd v-if="cmd.shortcut" class="palette-item-shortcut">{{ cmd.shortcut }}</kbd>
              </button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.palette-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 20vh;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.palette-container {
  width: 100%;
  max-width: 560px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border-subtle);
  border-radius: 12px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 60vh;
}

.palette-input-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.palette-search-icon {
  width: 18px;
  height: 18px;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.palette-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 0.9375rem;
  color: var(--color-text-primary);
  font-family: inherit;
}

.palette-input::placeholder {
  color: var(--color-text-muted);
}

.palette-esc-hint {
  flex-shrink: 0;
  padding: 2px 6px;
  font-size: 0.6875rem;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  color: var(--color-text-muted);
  background: var(--color-surface-overlay);
  border: 1px solid var(--color-border-subtle);
  border-radius: 4px;
}

.palette-results {
  overflow-y: auto;
  padding: 6px;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-subtle) transparent;
}

.palette-results::-webkit-scrollbar { width: 6px; }
.palette-results::-webkit-scrollbar-track { background: transparent; }
.palette-results::-webkit-scrollbar-thumb { background: var(--color-border-subtle); border-radius: 3px; }

.palette-empty {
  padding: 24px;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.palette-group-header {
  padding: 6px 10px 4px;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.palette-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-smooth),
              color var(--duration-fast) var(--ease-smooth);
  text-align: left;
}

.palette-item:hover,
.palette-item--selected {
  background: var(--color-surface-overlay);
  color: var(--color-text-primary);
}

.palette-item-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette-item-shortcut {
  flex-shrink: 0;
  margin-left: 12px;
  padding: 2px 6px;
  font-size: 0.6875rem;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  color: var(--color-text-muted);
  background: var(--color-surface-base);
  border: 1px solid var(--color-border-subtle);
  border-radius: 4px;
}

/* Transitions */
.palette-enter-active {
  transition: opacity var(--duration-fast) var(--ease-smooth);
}
.palette-enter-active .palette-container {
  transition: opacity var(--duration-modal) var(--ease-spring),
              transform var(--duration-modal) var(--ease-spring);
}
.palette-leave-active {
  transition: opacity var(--duration-fast) var(--ease-smooth);
}
.palette-leave-active .palette-container {
  transition: opacity var(--duration-fast) var(--ease-smooth),
              transform var(--duration-fast) var(--ease-smooth);
}

.palette-enter-from {
  opacity: 0;
}
.palette-enter-from .palette-container {
  opacity: 0;
  transform: scale(0.96) translateY(-8px);
}
.palette-leave-to {
  opacity: 0;
}
.palette-leave-to .palette-container {
  opacity: 0;
  transform: scale(0.98) translateY(-4px);
}
</style>
