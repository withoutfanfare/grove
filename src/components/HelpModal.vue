<script setup lang="ts">
/**
 * HelpModal Component
 *
 * In-app help and documentation modal with tabbed navigation
 * between Getting Started and Features guides.
 */
import { ref } from 'vue'
import { Modal, Button } from './ui'
import { useWt } from '../composables'

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const wt = useWt()

type HelpTab = 'getting-started' | 'features' | 'shortcuts'

const activeTab = ref<HelpTab>('getting-started')

const tabs: { id: HelpTab; label: string; icon: string }[] = [
  { id: 'getting-started', label: 'Getting Started', icon: 'rocket' },
  { id: 'features', label: 'Features', icon: 'sparkles' },
  { id: 'shortcuts', label: 'Shortcuts', icon: 'keyboard' },
]

// Keyboard shortcuts data
const shortcuts = [
  { keys: ['⌘', 'N'], action: 'Create new worktree' },
  { keys: ['⌘', 'R'], action: 'Refresh worktrees' },
  { keys: ['⌘', ','], action: 'Open settings' },
  { keys: ['⌘', 'M'], action: 'Repository management' },
  { keys: ['⌘', 'K'], action: 'Focus search' },
  { keys: ['⌘', 'P'], action: 'Pull all worktrees' },
  { keys: ['Esc'], action: 'Close modal / Clear search' },
  { keys: ['↑', '↓'], action: 'Navigate worktrees' },
  { keys: ['Enter'], action: 'Open selected worktree' },
]

async function openExternalDocs() {
  try {
    await wt.openInBrowser('https://github.com/your-org/grove#readme')
  } catch (e) {
    console.error('Failed to open external docs:', e)
  }
}
</script>

<template>
  <Modal
    :open="isOpen"
    title="Help & Documentation"
    size="xl"
    @close="emit('close')"
  >
    <template #icon>
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </template>

    <div class="flex flex-col h-[500px]">
      <!-- Tab Navigation -->
      <div class="flex items-center gap-1 pb-4 border-b border-border-subtle">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="[
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            activeTab === tab.id
              ? 'bg-primary/10 text-primary'
              : 'text-text-muted hover:text-text-primary hover:bg-surface-overlay'
          ]"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Tab Content -->
      <div class="flex-1 overflow-y-auto pt-4 pr-2">
        <!-- Getting Started -->
        <div v-if="activeTab === 'getting-started'" class="prose-help">
          <h2>Welcome to Grove</h2>
          <p>Grove is a desktop application for managing git worktrees. It provides a visual interface for the <code>wt</code> CLI tool.</p>

          <h3>Quick Start</h3>
          <ol>
            <li><strong>Select a repository</strong> from the sidebar on the left</li>
            <li><strong>View worktrees</strong> in the main panel - each card shows branch info, health grade, and status</li>
            <li><strong>Click actions</strong> to open in editor, terminal, or browser</li>
          </ol>

          <h3>Prerequisites</h3>
          <p>Before using Grove, you need at least one repository registered with <code>wt</code>:</p>
          <pre><code>cd /path/to/your/repo
wt setup</code></pre>
          <p>The <code>wt</code> CLI is bundled with the app - no separate installation required.</p>

          <h3>Health Grades</h3>
          <p>Each worktree displays a health grade:</p>
          <ul>
            <li><strong class="text-success">A</strong> - Excellent: clean, up to date</li>
            <li><strong class="text-info">B</strong> - Good: minor issues</li>
            <li><strong class="text-warning">C</strong> - Fair: needs attention</li>
            <li><strong class="text-warning">D</strong> - Poor: significant issues</li>
            <li><strong class="text-danger">F</strong> - Critical: requires action</li>
          </ul>

          <h3>Troubleshooting</h3>
          <p><strong>No repositories showing?</strong></p>
          <ul>
            <li>Register repositories using <code>wt setup</code> in each repo</li>
            <li>Click the refresh button in the header</li>
            <li>Check <code>wt repos</code> to verify registered repositories</li>
          </ul>
        </div>

        <!-- Features -->
        <div v-if="activeTab === 'features'" class="prose-help">
          <h2>Features Overview</h2>

          <h3>Dashboard</h3>
          <p>The main interface is divided into:</p>
          <ul>
            <li><strong>Sidebar</strong> - Repository list with worktree counts</li>
            <li><strong>Header</strong> - Search, actions, and status</li>
            <li><strong>Main Panel</strong> - Worktree cards grid</li>
          </ul>

          <h3>Worktree Cards</h3>
          <p>Each worktree card displays:</p>
          <ul>
            <li>Branch name and short commit SHA</li>
            <li>Health grade (A-F)</li>
            <li>Dirty/clean status badges</li>
            <li>Commits ahead/behind remote</li>
            <li>Filesystem path</li>
          </ul>

          <h3>Actions</h3>
          <ul>
            <li><strong>Open in Code</strong> - Opens in VS Code, Cursor, or configured editor</li>
            <li><strong>Open in Terminal</strong> - Opens terminal at worktree path</li>
            <li><strong>Open in Browser</strong> - Opens configured URL (e.g., Laravel Herd sites)</li>
            <li><strong>Open in Finder</strong> - Reveals folder in file manager</li>
          </ul>

          <h3>Bulk Operations</h3>
          <ul>
            <li><strong>Pull All</strong> - Updates all worktrees at once</li>
            <li><strong>Prune</strong> - Cleans up deleted remote branches</li>
          </ul>

          <h3>Repository Management</h3>
          <p>Access via the gear icon or <kbd>⌘M</kbd>:</p>
          <ul>
            <li><strong>Configuration</strong> - View and edit wt config files</li>
            <li><strong>Hooks</strong> - Manage lifecycle hooks (post-add, pre-rm, etc.)</li>
          </ul>

          <h3>Search</h3>
          <p>Use <kbd>⌘K</kbd> to focus search. Filter worktrees by branch name, path, or status.</p>
        </div>

        <!-- Shortcuts -->
        <div v-if="activeTab === 'shortcuts'" class="space-y-4">
          <h2 class="text-lg font-semibold text-text-primary mb-4">Keyboard Shortcuts</h2>
          
          <div class="space-y-2">
            <div
              v-for="shortcut in shortcuts"
              :key="shortcut.action"
              class="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-overlay/50"
            >
              <span class="text-sm text-text-secondary">{{ shortcut.action }}</span>
              <div class="flex items-center gap-1">
                <kbd
                  v-for="key in shortcut.keys"
                  :key="key"
                  class="px-2 py-1 text-xs font-mono bg-surface-base border border-border-subtle rounded"
                >
                  {{ key }}
                </kbd>
              </div>
            </div>
          </div>

          <p class="text-xs text-text-muted mt-4">
            Tip: Most shortcuts work when no modal is open. Press <kbd class="px-1 py-0.5 bg-surface-overlay rounded">?</kbd> anywhere to see this list.
          </p>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-between w-full">
        <Button
          variant="ghost"
          size="sm"
          @click="openExternalDocs"
        >
          <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open Full Documentation
        </Button>
        <Button
          variant="primary"
          @click="emit('close')"
        >
          Done
        </Button>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
/* Help content typography */
.prose-help {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.prose-help h2 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.75rem;
  margin-top: 0;
}

.prose-help h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
}

.prose-help p {
  margin-bottom: 0.75rem;
  line-height: 1.625;
}

.prose-help ul,
.prose-help ol {
  margin-bottom: 0.75rem;
  padding-left: 1.25rem;
}

.prose-help ul {
  list-style-type: disc;
}

.prose-help ol {
  list-style-type: decimal;
}

.prose-help li {
  line-height: 1.625;
  margin-bottom: 0.25rem;
}

.prose-help code {
  padding: 0.125rem 0.375rem;
  font-size: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  background: var(--color-surface-overlay);
  border-radius: 0.25rem;
  color: var(--color-text-primary);
}

.prose-help pre {
  padding: 0.75rem;
  border-radius: 0.5rem;
  background: var(--color-surface-overlay);
  overflow-x: auto;
  margin-bottom: 0.75rem;
}

.prose-help pre code {
  padding: 0;
  background: transparent;
}

.prose-help strong {
  color: var(--color-text-primary);
  font-weight: 500;
}

.prose-help kbd {
  padding: 0.125rem 0.375rem;
  font-size: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  background: var(--color-surface-base);
  border: 1px solid var(--color-border-subtle);
  border-radius: 0.25rem;
}
</style>
