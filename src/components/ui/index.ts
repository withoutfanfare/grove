/**
 * UI Component Library — Custom Components
 *
 * Components that remain app-specific because their API diverges
 * from the @stuntrocket/ui equivalents.
 *
 * Migrated to @stuntrocket/ui:
 *   Button → SButton, IconButton → SIconButton, Panel → SPanel,
 *   ToastContainer → SToastContainer (via useToastStack)
 */

// Form controls (custom — library equivalents lack label/error/hint props)
export { default as Input } from './Input.vue'
export { default as Select } from './Select.vue'
export { default as Toggle } from './Toggle.vue'
export { default as Checkbox } from './Checkbox.vue'

// Overlay (custom — library equivalents have different prop APIs)
export { default as Modal } from './Modal.vue'
export { default as ConfirmDialog } from './ConfirmDialog.vue'

// Dropdown menu (custom — library SDropdownMenu uses items array, not slot-based)
export { default as Dropdown } from './Dropdown.vue'
export { default as DropdownItem } from './DropdownItem.vue'

// Skeleton loaders (custom — library uses CSS values, custom uses Tailwind classes)
export { default as Skeleton } from './Skeleton.vue'
export { default as SkeletonCard } from './SkeletonCard.vue'
export { default as SkeletonList } from './SkeletonList.vue'

// Layout utilities (app-specific)
export { default as ResizeHandle } from './ResizeHandle.vue'
