<script setup lang="ts">
/**
 * HelpModal Component
 *
 * In-app help and documentation modal with tabbed navigation
 * covering Getting Started, Features, Configuration, Hooks, and Shortcuts.
 */
import { ref } from 'vue'
import { SModal, SButton, SKbd } from '@stuntrocket/ui'
import { useWt } from '../composables'

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const wt = useWt()

type HelpTab = 'getting-started' | 'features' | 'configuration' | 'hooks' | 'shortcuts'

const activeTab = ref<HelpTab>('getting-started')

const tabs: { id: HelpTab; label: string }[] = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'features', label: 'Features' },
  { id: 'configuration', label: 'Configuration' },
  { id: 'hooks', label: 'Hooks' },
  { id: 'shortcuts', label: 'Shortcuts' },
]

// Keyboard shortcuts data
const shortcuts = [
  { keys: ['⌘', 'N'], action: 'Create new worktree' },
  { keys: ['⌘', 'R'], action: 'Refresh worktrees' },
  { keys: ['⌘', ','], action: 'Open settings' },
  { keys: ['⌘', 'M'], action: 'Repository management' },
  { keys: ['⌘', 'K'], action: 'Command palette' },
  { keys: ['⌘', 'P'], action: 'Pull all worktrees' },
  { keys: ['⌘', 'O'], action: 'Open focused worktree in editor' },
  { keys: ['⌘', '⏎'], action: 'Quick Launch (editor, terminal, browser)' },
  { keys: ['Esc'], action: 'Close modal / Clear search' },
  { keys: ['↑', '↓'], action: 'Navigate repository list' },
  { keys: ['1-9'], action: 'Quick-select repository by position' },
  { keys: ['Enter'], action: 'Select focused repository' },
]

// Global shortcuts (work even when Grove is not focused)
const globalShortcuts = [
  { keys: ['⌃', '⇧', 'G'], action: 'Toggle Grove window (show/hide)' },
  { keys: ['⌃', '⇧', 'W'], action: 'Quick worktree switcher' },
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
  <SModal
    :open="isOpen"
    max-width="max-w-2xl"
    @close="emit('close')"
  >
    <template #header>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary">Help & Documentation</h2>
    </template>

    <div class="flex flex-col h-[500px]">
      <!-- Tab Navigation -->
      <div class="flex items-center gap-1 pb-4 border-b border-white/[0.04] overflow-x-auto">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="[
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex-shrink-0',
            activeTab === tab.id
              ? 'bg-accent/10 text-accent'
              : 'text-text-muted hover:text-text-primary hover:bg-surface-overlay'
          ]"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Tab Content -->
      <div class="flex-1 overflow-y-auto pt-4 pr-2 help-scroll">
        <!-- Getting Started -->
        <div v-if="activeTab === 'getting-started'" class="prose-help">
          <h2>Welcome to Grove</h2>
          <p>Grove is a desktop application for managing git worktrees. It provides a visual interface for the <code>grove</code> CLI tool, letting you work on multiple branches simultaneously without switching.</p>

          <h3>Quick Start</h3>
          <ol>
            <li><strong>Select a repository</strong> from the sidebar on the left</li>
            <li><strong>View worktrees</strong> in the main panel — each card shows branch info, health grade, and status</li>
            <li><strong>Click a card</strong> to expand its details panel with commits, file changes, and more</li>
            <li><strong>Use the actions menu</strong> (three-dot button) to open in editor, terminal, pull, sync, or delete</li>
          </ol>

          <h3>Prerequisites</h3>
          <p>Before using Grove, you need at least one repository registered with <code>grove</code>:</p>
          <pre><code>cd /path/to/your/repo
grove setup</code></pre>
          <p>The <code>grove</code> CLI is bundled with the app — no separate installation required.</p>

          <h3>Health Grades</h3>
          <p>Each worktree displays a health grade based on its state:</p>
          <ul>
            <li><strong class="text-success">A</strong> — Excellent: clean, up to date, no issues</li>
            <li><strong class="text-accent">B</strong> — Good: minor issues that may need attention</li>
            <li><strong class="text-warning">C</strong> — Fair: some issues should be addressed</li>
            <li><strong class="text-warning">D</strong> — Poor: significant issues need attention</li>
            <li><strong class="text-danger">F</strong> — Critical: requires immediate action</li>
          </ul>

          <h3>Status Badges</h3>
          <p>Worktree cards may show coloured badges indicating special states:</p>
          <ul>
            <li><strong class="text-success">Merged</strong> — Branch has been merged into the base branch and can be safely removed</li>
            <li><strong class="text-warning">Stale</strong> — Worktree is more than 50 commits behind the base branch</li>
            <li><strong class="text-accent">Mismatch</strong> — Directory name doesn't match the branch name, which may cause confusion</li>
          </ul>

          <h3>Customise Your Workflow with Hooks</h3>
          <p>One of Grove's most powerful features is <strong>lifecycle hooks</strong> — custom shell scripts that run automatically when you create, pull, sync, or delete worktrees. This means you can fully automate your project setup:</p>
          <ul>
            <li><strong>New worktree created?</strong> Automatically install dependencies, copy environment files, run migrations, and build assets — your branch is ready to work on instantly</li>
            <li><strong>Pulled changes?</strong> Automatically rebuild assets or restart services</li>
            <li><strong>Removing a worktree?</strong> Clean up databases, Docker containers, or temporary files first</li>
          </ul>
          <p>Hooks are fully customisable per-project or globally. See the <strong>Hooks</strong> tab for full details and examples, or open <strong>Repository Management</strong> (<kbd>⌘M</kbd>) to start creating your own.</p>

          <h3>Troubleshooting</h3>
          <p><strong>No repositories showing?</strong></p>
          <ul>
            <li>Register repositories using <code>grove setup</code> in each repo's directory</li>
            <li>Click the refresh button in the header or press <kbd>⌘R</kbd></li>
            <li>Run <code>grove repos</code> in your terminal to verify registered repositories</li>
          </ul>
          <p><strong>Worktree operations failing?</strong></p>
          <ul>
            <li>Try the <strong>Repair</strong> action from the repository's three-dot menu in the sidebar</li>
            <li>Use <strong>Unlock</strong> if you see lock-related errors</li>
            <li>Ensure you have no uncommitted changes when syncing</li>
          </ul>
        </div>

        <!-- Features -->
        <div v-if="activeTab === 'features'" class="prose-help">
          <h2>Features Overview</h2>

          <h3>Dashboard Layout</h3>
          <p>The main interface is divided into three areas:</p>
          <ul>
            <li><strong>Sidebar</strong> — Repository list with worktree counts, recent worktrees tab, and quick-select shortcuts (1-9)</li>
            <li><strong>Header</strong> — Repository name, search bar, and action buttons (Pull All, Health, Prune, Create)</li>
            <li><strong>Main Panel</strong> — Worktree cards that expand to show detailed information</li>
          </ul>

          <h3>Worktree Cards</h3>
          <p>Click any card to expand its details panel, which shows:</p>
          <ul>
            <li>Full filesystem path and remote URL</li>
            <li>Health grade breakdown with explanation</li>
            <li>Sync status (dirty, ahead, behind)</li>
            <li>Recent commits on the branch</li>
            <li>Uncommitted file changes</li>
          </ul>

          <h3>Card Actions</h3>
          <p>Each card has a three-dot menu with these actions:</p>
          <ul>
            <li><strong>Show Details</strong> — Toggle the details panel</li>
            <li><strong>Quick Launch</strong> — Opens editor, terminal, and browser simultaneously</li>
            <li><strong>Pull</strong> — Fetch and merge latest changes from remote</li>
            <li><strong>Sync with Base</strong> — Rebase the branch onto the base branch (requires clean working tree)</li>
            <li><strong>Open in...</strong> — Editor, Terminal, Git Client, Browser, or Finder individually</li>
            <li><strong>Copy</strong> — Path, branch name, URL, or cd command to clipboard</li>
            <li><strong>Delete Worktree</strong> — Remove the worktree (with confirmation)</li>
          </ul>

          <h3>Bulk Operations</h3>
          <ul>
            <li><strong>Pull All</strong> — Updates all worktrees in the selected repository at once, with a progress panel showing per-branch status</li>
            <li><strong>Prune</strong> — Cleans up worktrees whose remote branches have been deleted</li>
          </ul>
          <p>Both operations show a progress panel with the ability to cancel, retry failed items, and resolve conflicts by opening the affected worktree in your editor or terminal.</p>

          <h3>Repository Management</h3>
          <p>Access via the three-dot menu on a selected repository in the sidebar, or press <kbd>⌘M</kbd>:</p>
          <ul>
            <li><strong>Edit Config</strong> — View and edit grove configuration files (see Configuration tab)</li>
            <li><strong>Manage Hooks</strong> — Create, edit, and manage lifecycle hooks (see Hooks tab)</li>
            <li><strong>Refresh</strong> — Reload worktree data for the repository</li>
            <li><strong>Repair</strong> — Fix common repository issues automatically</li>
            <li><strong>Unlock</strong> — Remove stale lock files that may block operations</li>
            <li><strong>Export Report</strong> — Generate a health report and save it to your Desktop</li>
          </ul>

          <h3>Search</h3>
          <p>Press <kbd>⌘K</kbd> to open the command palette for quick access to any action. Use <kbd>⌘F</kbd> or <kbd>/</kbd> to focus the search bar. Both the sidebar and main panel have search:</p>
          <ul>
            <li><strong>Repository search</strong> — Filter the sidebar list by repository name</li>
            <li><strong>Worktree search</strong> — Filter worktree cards by branch name, path, or status</li>
          </ul>

          <h3>Recent Worktrees</h3>
          <p>Switch to the <strong>Recent</strong> tab in the sidebar to see worktrees you've recently interacted with across all repositories. Click any entry to navigate directly to that worktree with its details expanded.</p>

          <h3>System Tray</h3>
          <p>Grove lives in your menu bar for quick access. Closing the window hides it to the tray rather than quitting. Use the tray menu for quick access to worktrees and common actions.</p>

          <h3>Live Watching</h3>
          <p>When a repository is selected, Grove monitors the filesystem for changes and automatically refreshes the worktree list. The green <strong>Live</strong> indicator in the header shows when watching is active.</p>
        </div>

        <!-- Configuration -->
        <div v-if="activeTab === 'configuration'" class="prose-help">
          <h2>Configuration</h2>
          <p>The <code>grove</code> CLI uses a layered configuration system. Settings cascade from global defaults down to repository-specific overrides.</p>

          <h3>Configuration Layers</h3>
          <p>Configuration is loaded in order, with later layers overriding earlier ones:</p>
          <ol>
            <li><strong>Global config</strong> — <code>~/.groverc</code> — applies to all repositories</li>
            <li><strong>Repository config</strong> — <code>.groveconfig</code> in each repo — overrides for that repository</li>
          </ol>

          <h3>Viewing Configuration</h3>
          <p>Open <strong>Repository Management</strong> (<kbd>⌘M</kbd>) and select the <strong>Configuration</strong> tab. You'll see:</p>
          <ul>
            <li>The <strong>effective config</strong> card showing the merged result of all layers</li>
            <li>Individual <strong>config files</strong> with their status (exists, writable, symlinked)</li>
          </ul>

          <h3>Editing Configuration</h3>
          <p>You can edit config files in two ways:</p>
          <ul>
            <li><strong>Edit in Grove</strong> — Click the Edit button on any writable config file to use the built-in editor</li>
            <li><strong>Open in Editor</strong> — Click the external editor button to open in VS Code, Cursor, or your configured editor</li>
          </ul>
          <p>If a config file doesn't exist yet, you can create it using the <strong>Create</strong> button.</p>

          <h3>Common Settings</h3>
          <p>Key configuration options you can set:</p>
          <ul>
            <li><strong>base</strong> — Default base branch for new worktrees (e.g., <code>main</code>, <code>develop</code>)</li>
            <li><strong>remote</strong> — Default remote name (usually <code>origin</code>)</li>
            <li><strong>url</strong> — URL template for opening worktrees in browser</li>
            <li><strong>editor</strong> — Preferred code editor command</li>
          </ul>

          <h3>Grove Settings</h3>
          <p>Grove's own preferences (editor, terminal, git client) are configured separately via <strong>Settings</strong> (<kbd>⌘,</kbd>). These control which applications Grove uses when opening worktrees.</p>
        </div>

        <!-- Hooks -->
        <div v-if="activeTab === 'hooks'" class="prose-help">
          <h2>Lifecycle Hooks</h2>
          <p>Hooks let you fully customise how worktrees are set up, maintained, and torn down. They're shell scripts that run automatically at key moments — meaning every new branch can be ready to work on instantly, and cleanup happens without you thinking about it.</p>
          <p>This is one of Grove's most powerful features: instead of manually running setup steps every time you create a worktree, you write them once and they run automatically for every branch you work on.</p>

          <h3>What Can You Automate?</h3>
          <p>Here are some common things teams automate with hooks:</p>
          <ul>
            <li><strong>Project setup</strong> — Install dependencies, copy environment files, generate keys, seed databases</li>
            <li><strong>Database per branch</strong> — Create an isolated database for each worktree so branches don't interfere with each other</li>
            <li><strong>Docker environments</strong> — Spin up containers when a worktree is created, tear them down when it's removed</li>
            <li><strong>Asset building</strong> — Compile frontend assets after pulling changes or creating a new branch</li>
            <li><strong>Notifications</strong> — Post to Slack or send an alert when a branch is created or deleted</li>
            <li><strong>Cleanup</strong> — Drop databases, remove Docker volumes, or delete temporary files when a worktree is removed</li>
            <li><strong>Safety checks</strong> — Prevent accidental deletion of worktrees with uncommitted work</li>
          </ul>

          <h3>Hook Events</h3>
          <p>You can hook into these moments in a worktree's lifecycle:</p>
          <ul>
            <li><strong>Pre-Add</strong> — Before creating a new worktree. Can abort the operation by exiting with a non-zero code.</li>
            <li><strong>Post-Add</strong> — After a new worktree is created. The most commonly used hook — perfect for project setup.</li>
            <li><strong>Post-Pull</strong> — After pulling changes. Rebuild assets, run migrations for new changes.</li>
            <li><strong>Post-Switch</strong> — After switching branches within a worktree.</li>
            <li><strong>Post-Sync</strong> — After syncing a worktree with the base branch.</li>
            <li><strong>Pre-Rm</strong> — Before removing a worktree. Use for safety checks or pre-cleanup.</li>
            <li><strong>Post-Rm</strong> — After a worktree is removed. Clean up databases, containers, or temp files.</li>
          </ul>

          <h3>Hook Scopes</h3>
          <p>Hooks can be defined at different levels, letting you share common setup across all projects while adding project-specific steps:</p>
          <ul>
            <li><strong>Global (.d)</strong> — Scripts in <code>~/.grove/hooks/&lt;event&gt;.d/</code> that run for all repositories. Multiple scripts run in filename order.</li>
            <li><strong>Repository (.d)</strong> — Scripts in <code>.grove/hooks/&lt;event&gt;.d/</code> within a specific repo. Run after global scripts.</li>
            <li><strong>Single</strong> — A single hook file that replaces all .d scripts for that event.</li>
          </ul>
          <p>For example, you might have a global post-add hook that opens the worktree in your editor, plus a repo-specific one that runs <code>composer install</code> for PHP projects.</p>

          <h3>Creating Hooks in Grove</h3>
          <p>Open <strong>Repository Management</strong> (<kbd>⌘M</kbd>) and select the <strong>Hooks</strong> tab. From there you can:</p>
          <ul>
            <li><strong>Create</strong> — Click <strong>New Hook</strong> to create a hook with a starter template. Choose the event and scope, give it a filename, and Grove creates the script for you.</li>
            <li><strong>Edit</strong> — Use the three-dot menu on any hook to edit it in Grove's built-in editor (with line numbers and <kbd>⌘S</kbd> to save) or open it in your preferred external editor.</li>
            <li><strong>Enable/Disable</strong> — Temporarily disable a hook without deleting it by toggling its executable permission.</li>
            <li><strong>Delete</strong> — Remove a hook permanently (with confirmation).</li>
          </ul>

          <h3>Writing Hooks</h3>
          <p>Hooks are standard shell scripts. A few tips:</p>
          <ul>
            <li>Start with <code>#!/bin/bash</code> and <code>set -e</code> to fail on errors</li>
            <li>Use the provided environment variables: <code>WT_REPO_NAME</code>, <code>WT_BRANCH</code>, <code>WT_PATH</code></li>
            <li>For .d scripts, prefix filenames with two digits for ordering (e.g., <code>01-install.sh</code>, <code>02-migrate.sh</code>)</li>
            <li>Pre-hooks can prevent the operation by exiting with a non-zero status code</li>
          </ul>

          <h3>Example: Laravel Project Setup</h3>
          <p>A post-add hook that makes every new worktree ready to develop on:</p>
          <pre><code>#!/bin/bash
set -e

cd "$WT_PATH"
cp .env.example .env
composer install
php artisan key:generate
php artisan migrate --seed
npm install && npm run build

echo "✓ $WT_BRANCH is ready to go"</code></pre>

          <h3>Example: Database Per Branch</h3>
          <p>Create an isolated database for each worktree, and drop it on removal:</p>
          <pre><code># post_add.d/01-create-db.sh
#!/bin/bash
set -e
DB_NAME="myapp_${WT_BRANCH//[^a-zA-Z0-9]/_}"
mysql -u root -e "CREATE DATABASE IF NOT EXISTS $DB_NAME"
cd "$WT_PATH"
sed -i '' "s/DB_DATABASE=.*/DB_DATABASE=$DB_NAME/" .env
php artisan migrate --seed</code></pre>
          <pre><code># pre_rm.d/01-drop-db.sh
#!/bin/bash
DB_NAME="myapp_${WT_BRANCH//[^a-zA-Z0-9]/_}"
mysql -u root -e "DROP DATABASE IF EXISTS $DB_NAME"
echo "Dropped database $DB_NAME"</code></pre>

          <h3>Example: Docker Environment</h3>
          <p>Manage Docker containers per worktree:</p>
          <pre><code># post_add.d/01-docker.sh
#!/bin/bash
set -e
cd "$WT_PATH"
docker compose up -d
echo "Docker services started for $WT_BRANCH"</code></pre>
          <pre><code># post_rm.d/01-docker-cleanup.sh
#!/bin/bash
cd "$WT_PATH" 2>/dev/null || exit 0
docker compose down -v
echo "Docker services removed for $WT_BRANCH"</code></pre>

          <h3>Security</h3>
          <p>Hooks display a security status badge:</p>
          <ul>
            <li><strong class="text-success">Enabled</strong> — Script is executable and allowed to run</li>
            <li><strong class="text-warning">Insecure</strong> — Script is world-writable, which is a security risk</li>
            <li><strong class="text-danger">Blocked</strong> — Script is not allowed to run (check the blocked reason)</li>
            <li><strong>Disabled</strong> — Script is not executable</li>
          </ul>
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
                <SKbd
                  v-for="key in shortcut.keys"
                  :key="key"
                  class="px-2 py-1 text-xs font-mono bg-surface-base border border-white/[0.04] rounded"
                >
                  {{ key }}
                </SKbd>
              </div>
            </div>
          </div>

          <h3 class="text-sm font-semibold text-text-primary mt-6 mb-2">Global Shortcuts</h3>
          <p class="text-xs text-text-muted mb-3">These work even when Grove is not focused.</p>
          <div class="space-y-2">
            <div
              v-for="shortcut in globalShortcuts"
              :key="shortcut.action"
              class="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-overlay/50"
            >
              <span class="text-sm text-text-secondary">{{ shortcut.action }}</span>
              <div class="flex items-center gap-1">
                <SKbd
                  v-for="key in shortcut.keys"
                  :key="key"
                  class="px-2 py-1 text-xs font-mono bg-surface-base border border-white/[0.04] rounded"
                >
                  {{ key }}
                </SKbd>
              </div>
            </div>
          </div>

          <p class="text-xs text-text-muted mt-4">
            Tip: Most shortcuts work when no modal is open. Press <SKbd>?</SKbd> anywhere to see this list.
          </p>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-between w-full">
        <SButton
          variant="ghost"
          size="sm"
          @click="openExternalDocs"
        >
          <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open Full Documentation
        </SButton>
        <SButton
          variant="primary"
          @click="emit('close')"
        >
          Done
        </SButton>
      </div>
    </template>
  </SModal>
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

.help-scroll {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-subtle) transparent;
}
.help-scroll::-webkit-scrollbar { width: 6px; }
.help-scroll::-webkit-scrollbar-track { background: transparent; }
.help-scroll::-webkit-scrollbar-thumb { background: var(--color-border-subtle); border-radius: 3px; }
.help-scroll::-webkit-scrollbar-thumb:hover { background: var(--color-border-default); }
</style>
