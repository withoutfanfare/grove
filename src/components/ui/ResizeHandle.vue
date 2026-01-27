<script setup lang="ts">
/**
 * ResizeHandle Component
 *
 * Vertical resize handle for dragging to resize adjacent panels.
 * Shows a subtle visual indicator that expands on hover.
 */
defineProps<{
  /** Whether resize is currently active */
  isResizing?: boolean;
}>();

const emit = defineEmits<{
  /** Emitted when user starts dragging */
  dragStart: [event: MouseEvent];
  /** Emitted on double-click (typically to reset) */
  reset: [];
}>();

function handleMouseDown(event: MouseEvent) {
  emit('dragStart', event);
}

function handleDoubleClick() {
  emit('reset');
}
</script>

<template>
  <div
    class="resize-handle group"
    :class="{ 'is-resizing': isResizing }"
    @mousedown="handleMouseDown"
    @dblclick="handleDoubleClick"
  >
    <!-- Visual indicator line -->
    <div class="resize-indicator" />
  </div>
</template>

<style scoped>
.resize-handle {
  position: relative;
  width: 8px;
  margin-left: -4px;
  margin-right: -4px;
  cursor: col-resize;
  z-index: 10;
  flex-shrink: 0;
}

.resize-indicator {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  margin-left: -1px;
  background-color: transparent;
  transition: background-color var(--duration-fast) ease;
}

.resize-handle:hover .resize-indicator,
.resize-handle.is-resizing .resize-indicator {
  background-color: var(--color-accent);
}

.resize-handle.is-resizing .resize-indicator {
  width: 3px;
  margin-left: -1.5px;
}
</style>
