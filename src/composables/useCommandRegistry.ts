import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorktreeStore } from '../stores'
import { usePlatform } from './useKeyboardShortcuts'

export interface Command {
  id: string
  title: string
  category: 'Navigation' | 'Worktree' | 'Repository' | 'Tools' | 'Settings'
  shortcut?: string
  action: () => void
  visible?: boolean
}

export interface CommandHandlers {
  onRefresh: () => void
  onCreateWorktree: () => void
  onOpenSettings: () => void
  onOpenRepoManagement: () => void
  onOpenHelp: () => void
  onFocusSearch: () => void
  onPullAll: () => void
  onPrune: () => void
  onOpenHealthPanel: () => void
  onOpenEditor: () => void
  onOpenTerminal: () => void
  onOpenBrowser: () => void
  onOpenAll: () => void
  onCopyPath: () => void
  onCopyBranch: () => void
  onCopyUrl: () => void
  onCopyCdCommand: () => void
  onPullWorktree: () => void
  onSyncWorktree: () => void
  onDeleteWorktree: () => void
  onSelectRepo: (index: number) => void
}

export function useCommandRegistry(handlers: CommandHandlers) {
  const store = useWorktreeStore()
  const { selectedRepo, repositories, focusedBranch } = storeToRefs(store)
  const { formatShortcut } = usePlatform()

  const hasRepo = computed(() => !!selectedRepo.value)
  const hasWorktree = computed(() => !!focusedBranch.value)

  const commands = computed<Command[]>(() => {
    const cmds: Command[] = []

    // --- Navigation ---
    cmds.push({
      id: 'focus-search',
      title: 'Focus Search',
      category: 'Navigation',
      shortcut: formatShortcut('F'),
      action: handlers.onFocusSearch,
    })
    cmds.push({
      id: 'open-help',
      title: 'Help & Documentation',
      category: 'Navigation',
      shortcut: '?',
      action: handlers.onOpenHelp,
    })

    // --- Settings ---
    cmds.push({
      id: 'open-settings',
      title: 'Open Settings',
      category: 'Settings',
      shortcut: formatShortcut(','),
      action: handlers.onOpenSettings,
    })

    // --- Repository ---
    cmds.push({
      id: 'refresh',
      title: 'Refresh',
      category: 'Repository',
      shortcut: formatShortcut('R'),
      action: handlers.onRefresh,
      visible: hasRepo.value,
    })
    cmds.push({
      id: 'repo-management',
      title: 'Repository Management',
      category: 'Repository',
      shortcut: formatShortcut('M'),
      action: handlers.onOpenRepoManagement,
      visible: hasRepo.value,
    })
    cmds.push({
      id: 'health-report',
      title: 'Health Report',
      category: 'Repository',
      action: handlers.onOpenHealthPanel,
      visible: hasRepo.value,
    })
    cmds.push({
      id: 'pull-all',
      title: 'Pull All Worktrees',
      category: 'Repository',
      action: handlers.onPullAll,
      visible: hasRepo.value,
    })
    cmds.push({
      id: 'prune',
      title: 'Clean Up (Prune)',
      category: 'Repository',
      action: handlers.onPrune,
      visible: hasRepo.value,
    })
    cmds.push({
      id: 'create-worktree',
      title: 'Create Worktree',
      category: 'Repository',
      shortcut: formatShortcut('N'),
      action: handlers.onCreateWorktree,
      visible: hasRepo.value,
    })

    // --- Worktree (contextual) ---
    if (hasWorktree.value) {
      cmds.push({
        id: 'open-editor',
        title: 'Open in Editor',
        category: 'Worktree',
        shortcut: formatShortcut('O'),
        action: handlers.onOpenEditor,
      })
      cmds.push({
        id: 'open-terminal',
        title: 'Open in Terminal',
        category: 'Worktree',
        shortcut: formatShortcut('T'),
        action: handlers.onOpenTerminal,
      })
      cmds.push({
        id: 'open-browser',
        title: 'Open in Browser',
        category: 'Worktree',
        shortcut: formatShortcut('B'),
        action: handlers.onOpenBrowser,
      })
      cmds.push({
        id: 'open-all',
        title: 'Quick Launch (All)',
        category: 'Worktree',
        shortcut: formatShortcut('⏎'),
        action: handlers.onOpenAll,
      })
      cmds.push({
        id: 'copy-path',
        title: 'Copy Path',
        category: 'Worktree',
        shortcut: formatShortcut('C'),
        action: handlers.onCopyPath,
      })
      cmds.push({
        id: 'copy-branch',
        title: 'Copy Branch Name',
        category: 'Worktree',
        shortcut: '⇧' + formatShortcut('C'),
        action: handlers.onCopyBranch,
      })
      cmds.push({
        id: 'copy-url',
        title: 'Copy URL',
        category: 'Worktree',
        shortcut: '⌥' + formatShortcut('C'),
        action: handlers.onCopyUrl,
      })
      cmds.push({
        id: 'copy-cd',
        title: 'Copy cd Command',
        category: 'Worktree',
        shortcut: '⇧' + formatShortcut('D'),
        action: handlers.onCopyCdCommand,
      })
      cmds.push({
        id: 'pull-worktree',
        title: 'Pull Worktree',
        category: 'Worktree',
        action: handlers.onPullWorktree,
      })
      cmds.push({
        id: 'sync-worktree',
        title: 'Sync Worktree',
        category: 'Worktree',
        action: handlers.onSyncWorktree,
      })
      cmds.push({
        id: 'delete-worktree',
        title: 'Delete Worktree',
        category: 'Worktree',
        action: handlers.onDeleteWorktree,
      })
    }

    // --- Tools: Repo quick switch ---
    repositories.value.forEach((repo, index) => {
      if (index < 9) {
        cmds.push({
          id: `switch-repo-${repo.name}`,
          title: `Switch to ${repo.name}`,
          category: 'Tools',
          shortcut: formatShortcut(String(index + 1)),
          action: () => handlers.onSelectRepo(index),
        })
      }
    })

    return cmds
  })

  const visibleCommands = computed(() =>
    commands.value.filter((cmd) => cmd.visible !== false)
  )

  return { commands: visibleCommands }
}
