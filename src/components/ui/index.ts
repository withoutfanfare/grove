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
 *   Checkbox → SCheckbox, Modal → SModal, ConfirmDialog → SConfirmDialog,
 *   Skeleton → SSkeleton, ResizeHandle → SResizableSplit
 */

// Dropdown menu (custom — library SDropdownMenu uses items array, not slot-based)
export { default as Dropdown } from './Dropdown.vue'
export { default as DropdownItem } from './DropdownItem.vue'

// Skeleton loaders (composed layouts using SSkeleton from @stuntrocket/ui)
export { default as SkeletonCard } from './SkeletonCard.vue'
export { default as SkeletonList } from './SkeletonList.vue'
