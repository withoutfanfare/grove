# Premium Desktop UI Overhaul Plan

## Design Philosophy

Combining the best of:
- **Linear/Raycast**: Minimal, refined, subtle gradients, sophisticated dark mode
- **Arc/Notion**: Playful yet polished, gentle personality
- **Tower/Fork**: Information-dense, functional, developer-focused

### Core Principles
1. **Native feel** - Feels like it belongs on macOS, not a web app in a frame
2. **Information density** - Show what matters without clutter
3. **Subtle depth** - Layered surfaces with refined shadows and gradients
4. **Micro-interactions** - Smooth, purposeful animations that feel premium
5. **Consistent rhythm** - 4px base grid, harmonious spacing

---

## Phase 1: Design System Foundation

### 1.1 Tailwind Configuration (`tailwind.config.js`)

Create a custom design system with:

```javascript
// Color palette - refined dark theme with depth
colors: {
  // Surface layers (from deepest to highest)
  surface: {
    base: '#0a0a0b',      // Window background
    raised: '#141416',    // Cards, sidebar
    overlay: '#1c1c1f',   // Modals, dropdowns
    elevated: '#242428',  // Hover states
  },

  // Borders with subtle visibility
  border: {
    subtle: 'rgba(255,255,255,0.06)',
    default: 'rgba(255,255,255,0.1)',
    strong: 'rgba(255,255,255,0.15)',
  },

  // Text hierarchy
  text: {
    primary: '#fafafa',
    secondary: '#a1a1aa',
    tertiary: '#71717a',
    muted: '#52525b',
  },

  // Accent - refined blue (Linear-inspired)
  accent: {
    DEFAULT: '#6366f1',
    hover: '#818cf8',
    muted: 'rgba(99,102,241,0.15)',
  },

  // Semantic colours (desaturated for sophistication)
  success: { DEFAULT: '#22c55e', muted: 'rgba(34,197,94,0.15)' },
  warning: { DEFAULT: '#f59e0b', muted: 'rgba(245,158,11,0.15)' },
  danger: { DEFAULT: '#ef4444', muted: 'rgba(239,68,68,0.15)' },
}

// Typography - system font stack for native feel
fontFamily: {
  sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'system-ui', 'sans-serif'],
  mono: ['SF Mono', 'JetBrains Mono', 'Menlo', 'monospace'],
}

// Refined shadows for depth
boxShadow: {
  'elevation-1': '0 1px 2px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.15)',
  'elevation-2': '0 4px 6px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2)',
  'elevation-3': '0 10px 15px rgba(0,0,0,0.3), 0 4px 6px rgba(0,0,0,0.2)',
  'glow': '0 0 20px rgba(99,102,241,0.3)',
}

// Smooth animations
transitionTimingFunction: {
  'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
  'bounce': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
}
```

### 1.2 Base Styles (`styles.css`)

- CSS custom properties for dynamic theming
- Smooth scrollbar styling (native-like)
- Selection colours
- Focus ring styles (subtle, elegant)
- Reduced motion support

---

## Phase 2: Component Overhaul

### 2.1 Layout Structure

**App Shell (new)**
- Window chrome integration (draggable title bar region)
- Three-column layout: Sidebar | Main | Panel
- Resizable sidebar with drag handle
- Keyboard navigation support

**Sidebar (`RepoList.vue`)**
- Collapsible with keyboard shortcut (⌘+B)
- Section headers with subtle dividers
- Hover states with left accent border
- Active state with gradient background
- Repository count badges
- Smooth scroll with fade edges

### 2.2 Core Components

**WorktreeCard.vue** - Complete redesign
```text
┌─────────────────────────────────────────────────────────────┐
│ ┌──────┐                                                    │
│ │ main │  abc1234   A   ✓ Clean   ↑2 ↓0                    │
│ └──────┘                                                    │
│                                                             │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐    ┌──────┐ ┌──────┐ ┌────┐│
│ │ IDE │ │Term │ │ Web │ │Find │    │ Pull │ │ Sync │ │ ⋮  ││
│ └─────┘ └─────┘ └─────┘ └─────┘    └──────┘ └──────┘ └────┘│
└─────────────────────────────────────────────────────────────┘

Features:
- Grouped action buttons (navigation | git ops | menu)
- Keyboard shortcuts shown on hover
- Expandable details section
- Inline operation feedback (no toast)
- Subtle gradient background on hover
```

**StatusBadge.vue** - Refined indicators
- Pill-shaped badges with icons
- Colour-coded dot + text
- Tooltips with details
- Animated transitions between states

**GradeBadge.vue** - Premium health display
- Circular progress ring (like Activity rings)
- Letter grade centred
- Smooth colour transitions
- Hover to show score breakdown

### 2.3 Modal System

**New modal design principles:**
- Backdrop blur (8px) for depth
- Slide-up animation with spring physics
- Rounded corners (16px)
- Subtle inner shadow for depth
- Clear visual hierarchy
- Escape to close, click outside to close
- Focus trap for accessibility

**CreateWorktreeModal.vue**
- Step indicator if multi-step
- Branch name with validation feedback
- Dropdown with search for base branch
- Template quick-select buttons
- Keyboard shortcuts (⌘+Enter to submit)

**DeleteWorktreeDialog.vue**
- Destructive action styling (red accents)
- Clear consequences listed
- Confirmation input for dangerous actions
- Disabled submit until confirmed

**SettingsModal.vue**
- Grouped settings with section headers
- Toggle switches (iOS-style)
- Dropdown menus with icons
- Reset to defaults with confirmation

### 2.4 Panel System

**HealthPanel.vue**
- Header with close button and title
- Summary cards in a grid
- Collapsible issue sections
- Per-worktree accordion
- Smooth slide-in animation

**OperationProgressPanel.vue**
- Compact inline progress bar
- Item list with status icons
- Expandable error details
- Auto-dismiss option after success
- Cancel operation button

---

## Phase 3: Micro-interactions

### 3.1 Transitions

- **Page transitions**: Fade + subtle slide (200ms)
- **Modal open**: Scale from 0.95 + fade (250ms, spring)
- **Panel slide**: Transform X with spring physics
- **List items**: Staggered fade-in on load
- **Button hover**: Scale 1.02 + shadow lift
- **Focus states**: Ring fade-in (150ms)

### 3.2 Loading States

- Skeleton loading for cards
- Shimmer effect on skeletons
- Spinner with brand accent colour
- Progress bars with gradient shine

### 3.3 Feedback

- Success: Green checkmark with scale animation
- Error: Shake animation + red highlight
- Warning: Yellow pulse
- Tooltips: Fade + slight Y offset

---

## Phase 4: Polish Details

### 4.1 Typography

- Tighter letter-spacing for headings (-0.02em)
- Looser line-height for body (1.6)
- Monospace for technical values (SHA, paths)
- Truncation with ellipsis + tooltip for full value

### 4.2 Icons

- Consistent icon set (Lucide or Heroicons)
- 16px default size, 20px for primary actions
- Subtle stroke weight (1.5px)
- Animated icons for loading/success/error

### 4.3 Scrolling

- Native scrollbar styling (thin, auto-hide)
- Fade edges on scrollable areas
- Smooth scroll behaviour
- Preserve scroll position on navigation

### 4.4 Keyboard Navigation

- Visible focus indicators
- Arrow key navigation in lists
- ⌘+K command palette (future)
- Shortcut hints in tooltips

---

## Implementation Order

1. **Tailwind config + base styles** (foundation)
2. **App shell layout** (structure)
3. **Sidebar redesign** (navigation)
4. **WorktreeCard redesign** (main content)
5. **Badge components** (atomic elements)
6. **Modal system** (overlays)
7. **Panel system** (slide-outs)
8. **Micro-interactions** (polish)
9. **Final polish pass** (consistency check)

---

## Files to Create/Modify

### New Files
- `src/styles/tokens.css` - CSS custom properties
- `src/components/ui/Button.vue` - Unified button component
- `src/components/ui/Badge.vue` - Unified badge component
- `src/components/ui/Modal.vue` - Base modal component
- `src/components/ui/Panel.vue` - Base panel component
- `src/components/ui/Tooltip.vue` - Tooltip component
- `src/components/ui/IconButton.vue` - Icon-only button
- `src/components/layout/AppShell.vue` - Main layout wrapper
- `src/components/layout/Sidebar.vue` - Sidebar wrapper

### Modified Files
- `tailwind.config.js` - Custom design tokens
- `src/styles.css` - Base styles update
- `src/App.vue` - Use new AppShell
- `src/components/Dashboard.vue` - Layout refactor
- `src/components/RepoList.vue` - Sidebar redesign
- `src/components/WorktreeCard.vue` - Complete redesign
- `src/components/StatusBadge.vue` - Refined styling
- `src/components/GradeBadge.vue` - Premium styling
- `src/components/CreateWorktreeModal.vue` - New modal system
- `src/components/DeleteWorktreeDialog.vue` - New modal system
- `src/components/SettingsModal.vue` - New modal system
- `src/components/HealthPanel.vue` - New panel system
- `src/components/OperationProgressPanel.vue` - New panel system

---

## Success Criteria

- [ ] Feels native to macOS, not like a web app
- [ ] Smooth 60fps animations throughout
- [ ] Consistent spacing and typography
- [ ] Clear visual hierarchy
- [ ] Keyboard navigable
- [ ] No jarring transitions
- [ ] Information density maintained
- [ ] All existing functionality preserved
- [ ] TypeScript compiles without errors
- [ ] No console errors or warnings
