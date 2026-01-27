import { ref, onMounted, onUnmounted } from 'vue';

/**
 * Composable for managing a resizable sidebar with mouse drag.
 *
 * Features:
 * - Smooth drag-to-resize with immediate feedback
 * - Min/max width constraints
 * - Double-click to reset to default width
 * - Persistence to localStorage
 *
 * @example
 * ```typescript
 * const { width, isResizing, startResize, resetWidth } = useResizableSidebar({
 *   defaultWidth: 256,
 *   minWidth: 200,
 *   maxWidth: 400,
 *   storageKey: 'sidebar-width',
 * });
 * ```
 */

export interface ResizableSidebarOptions {
  /** Default width in pixels */
  defaultWidth?: number;
  /** Minimum width in pixels */
  minWidth?: number;
  /** Maximum width in pixels */
  maxWidth?: number;
  /** localStorage key for persistence */
  storageKey?: string;
}

export function useResizableSidebar(options: ResizableSidebarOptions = {}) {
  const {
    defaultWidth = 256,
    minWidth = 200,
    maxWidth = 400,
    storageKey = 'wt-sidebar-width',
  } = options;

  const width = ref(defaultWidth);
  const isResizing = ref(false);

  // Load saved width from localStorage
  function loadWidth() {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
          width.value = parsed;
        }
      }
    }
  }

  // Save width to localStorage
  function saveWidth() {
    if (storageKey) {
      localStorage.setItem(storageKey, String(width.value));
    }
  }

  // Handle mouse move during resize
  function handleMouseMove(event: MouseEvent) {
    if (!isResizing.value) return;

    // Clamp width to min/max bounds
    const newWidth = Math.max(minWidth, Math.min(maxWidth, event.clientX));
    width.value = newWidth;
  }

  // Handle mouse up to end resize
  function handleMouseUp() {
    if (isResizing.value) {
      isResizing.value = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      saveWidth();
    }
  }

  // Start resizing
  function startResize(event: MouseEvent) {
    event.preventDefault();
    isResizing.value = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  // Reset to default width (for double-click)
  function resetWidth() {
    width.value = defaultWidth;
    saveWidth();
  }

  // Set up global event listeners
  onMounted(() => {
    loadWidth();
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  });

  // Clean up event listeners
  onUnmounted(() => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  });

  return {
    /** Current sidebar width in pixels */
    width,
    /** Whether a resize operation is in progress */
    isResizing,
    /** Start resize operation (call on mousedown) */
    startResize,
    /** Reset to default width (call on double-click) */
    resetWidth,
  };
}
