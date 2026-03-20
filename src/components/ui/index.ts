/**
 * UI Component Library — Custom Components
 *
 * Components that remain app-specific because their API diverges
 * from the @stuntrocket/ui equivalents.
 *
 * Migrated to @stuntrocket/ui:
 *   Button → SButton, IconButton → SIconButton, Panel → SPanel,
 *   ToastContainer → SToastContainer (via useToastStack),
 *   Input → SInput, Select → SSelect, Toggle → SToggle,
 *   Checkbox → SCheckbox, Modal → SModal, ConfirmDialog → SConfirmDialog
 */

// Dropdown menu (custom — library SDropdownMenu uses items array, not slot-based)
export { default as Dropdown } from './Dropdown.vue'
export { default as DropdownItem } from './DropdownItem.vue'

// Skeleton loaders (custom — library uses CSS values, custom uses Tailwind classes)
export { default as Skeleton } from './Skeleton.vue'
export { default as SkeletonCard } from './SkeletonCard.vue'
export { default as SkeletonList } from './SkeletonList.vue'

// Layout utilities (app-specific)
export { default as ResizeHandle } from './ResizeHandle.vue'
