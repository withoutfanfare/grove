import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export type EditorChoice =
  | 'vscode'
  | 'cursor'
  | 'phpstorm'
  | 'zed'
  | 'sublime'
  | 'vim'
  | 'nvim'
  | 'custom';

export type TerminalChoice =
  | 'terminal'
  | 'iterm2'
  | 'warp'
  | 'alacritty'
  | 'wezterm';

export type GitClientChoice =
  | 'none'
  | 'gitkraken'
  | 'tower'
  | 'github-desktop'
  | 'sourcetree'
  | 'fork'
  | 'sublime-merge'
  | 'custom';

export type ReleaseChannel = 'stable' | 'beta';

/** A named group of repositories for sidebar organisation */
export interface RepositoryGroup {
  /** Display name of the group */
  name: string;
  /** Repository names assigned to this group */
  repos: string[];
  /** Whether the group section is collapsed in the sidebar */
  collapsed: boolean;
}

export interface Settings {
  editor: EditorChoice;
  customEditorPath: string;
  terminal: TerminalChoice;
  gitClient: GitClientChoice;
  customGitClientPath: string;
  defaultBaseBranch: string;
  enableNotifications: boolean;
  /** Background fetch interval in minutes (0 = disabled) */
  backgroundFetchInterval: number;
  /** Stale worktree threshold in days */
  staleThresholdDays: number;
  /** Whether to show attention badge on system tray */
  trayBadgeEnabled: boolean;
  /** Which states count towards tray badge: dirty, behind, stale */
  trayBadgeStates: string[];
  /** Release channel for auto-updates */
  releaseChannel: ReleaseChannel;
  /** Whether to check for updates automatically on launch */
  autoCheckUpdates: boolean;
  /** User-defined repository groups, ordered by display position */
  repositoryGroups: RepositoryGroup[];
  /** Brief purpose notes for worktrees, keyed by "repoName/branch" */
  worktreeNotes: Record<string, string>;
}

const STORAGE_KEY = 'wt-app-settings';

export const DEFAULT_SETTINGS: Settings = {
  editor: 'vscode',
  customEditorPath: '',
  terminal: 'terminal',
  gitClient: 'none',
  customGitClientPath: '',
  defaultBaseBranch: 'origin/main',
  enableNotifications: true,
  backgroundFetchInterval: 5,
  staleThresholdDays: 14,
  trayBadgeEnabled: true,
  trayBadgeStates: ['dirty', 'behind', 'stale'],
  releaseChannel: 'stable',
  autoCheckUpdates: true,
  repositoryGroups: [],
  worktreeNotes: {},
};

function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('Failed to load settings from localStorage:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save settings to localStorage:', e);
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>(loadSettings());

  // Auto-save when settings change
  watch(settings, (newSettings) => {
    saveSettings(newSettings);
  }, { deep: true });

  function setEditor(editor: EditorChoice) {
    settings.value.editor = editor;
  }

  function setCustomEditorPath(path: string) {
    settings.value.customEditorPath = path;
  }

  function setTerminal(terminal: TerminalChoice) {
    settings.value.terminal = terminal;
  }

  function setGitClient(gitClient: GitClientChoice) {
    settings.value.gitClient = gitClient;
  }

  function setCustomGitClientPath(path: string) {
    settings.value.customGitClientPath = path;
  }

  function setDefaultBaseBranch(branch: string) {
    settings.value.defaultBaseBranch = branch;
  }

  function setEnableNotifications(enabled: boolean) {
    settings.value.enableNotifications = enabled;
  }

  function setReleaseChannel(channel: ReleaseChannel) {
    settings.value.releaseChannel = channel;
  }

  function setAutoCheckUpdates(enabled: boolean) {
    settings.value.autoCheckUpdates = enabled;
  }

  function resetToDefaults() {
    settings.value = { ...DEFAULT_SETTINGS };
  }

  // ── Repository Groups ──────────────────────────────────────────────

  function createGroup(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const exists = settings.value.repositoryGroups.some(g => g.name === trimmed);
    if (exists) return;
    settings.value.repositoryGroups.push({ name: trimmed, repos: [], collapsed: false });
  }

  function deleteGroup(name: string) {
    settings.value.repositoryGroups = settings.value.repositoryGroups.filter(g => g.name !== name);
  }

  function renameGroup(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const group = settings.value.repositoryGroups.find(g => g.name === oldName);
    if (group) group.name = trimmed;
  }

  function assignRepoToGroup(repoName: string, groupName: string) {
    // Remove from any existing group first
    for (const group of settings.value.repositoryGroups) {
      group.repos = group.repos.filter(r => r !== repoName);
    }
    // Add to the target group
    const target = settings.value.repositoryGroups.find(g => g.name === groupName);
    if (target) target.repos.push(repoName);
  }

  function unassignRepo(repoName: string) {
    for (const group of settings.value.repositoryGroups) {
      group.repos = group.repos.filter(r => r !== repoName);
    }
  }

  function toggleGroupCollapsed(groupName: string) {
    const group = settings.value.repositoryGroups.find(g => g.name === groupName);
    if (group) group.collapsed = !group.collapsed;
  }

  function moveGroup(groupName: string, direction: 'up' | 'down') {
    const groups = settings.value.repositoryGroups;
    const idx = groups.findIndex(g => g.name === groupName);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= groups.length) return;
    [groups[idx], groups[swapIdx]] = [groups[swapIdx], groups[idx]];
  }

  function getRepoGroup(repoName: string): string | null {
    const group = settings.value.repositoryGroups.find(g => g.repos.includes(repoName));
    return group ? group.name : null;
  }

  // ── Worktree Notes ─────────────────────────────────────────────────

  function setWorktreeNote(repoName: string, branch: string, note: string) {
    const key = `${repoName}/${branch}`;
    const trimmed = note.trim().slice(0, 120);
    if (trimmed) {
      settings.value.worktreeNotes[key] = trimmed;
    } else {
      delete settings.value.worktreeNotes[key];
    }
  }

  function getWorktreeNote(repoName: string, branch: string): string {
    return settings.value.worktreeNotes[`${repoName}/${branch}`] ?? '';
  }

  function deleteWorktreeNote(repoName: string, branch: string) {
    delete settings.value.worktreeNotes[`${repoName}/${branch}`];
  }

  return {
    settings,
    setEditor,
    setCustomEditorPath,
    setTerminal,
    setGitClient,
    setCustomGitClientPath,
    setDefaultBaseBranch,
    setEnableNotifications,
    setReleaseChannel,
    setAutoCheckUpdates,
    resetToDefaults,
    // Repository groups
    createGroup,
    deleteGroup,
    renameGroup,
    assignRepoToGroup,
    unassignRepo,
    toggleGroupCollapsed,
    moveGroup,
    getRepoGroup,
    // Worktree notes
    setWorktreeNote,
    getWorktreeNote,
    deleteWorktreeNote,
  };
});

// Editor display names and descriptions
export const EDITOR_OPTIONS: { value: EditorChoice; label: string; description: string }[] = [
  { value: 'vscode', label: 'VS Code', description: 'Visual Studio Code' },
  { value: 'cursor', label: 'Cursor', description: 'Cursor AI Editor' },
  { value: 'phpstorm', label: 'PhpStorm', description: 'JetBrains PhpStorm' },
  { value: 'zed', label: 'Zed', description: 'Zed Editor' },
  { value: 'sublime', label: 'Sublime Text', description: 'Sublime Text Editor' },
  { value: 'vim', label: 'Vim', description: 'Vim (in terminal)' },
  { value: 'nvim', label: 'Neovim', description: 'Neovim (in terminal)' },
  { value: 'custom', label: 'Custom', description: 'Specify custom editor path' },
];

// Terminal display names
export const TERMINAL_OPTIONS: { value: TerminalChoice; label: string }[] = [
  { value: 'terminal', label: 'Terminal' },
  { value: 'iterm2', label: 'iTerm2' },
  { value: 'warp', label: 'Warp' },
  { value: 'alacritty', label: 'Alacritty' },
  { value: 'wezterm', label: 'WezTerm' },
];

// Release channel options
export const RELEASE_CHANNEL_OPTIONS: { value: ReleaseChannel; label: string; description: string }[] = [
  { value: 'stable', label: 'Stable', description: 'Production releases — tested and reliable' },
  { value: 'beta', label: 'Beta', description: 'Early access to new features — may contain bugs' },
];

// Git client display names and descriptions
export const GIT_CLIENT_OPTIONS: { value: GitClientChoice; label: string; description: string }[] = [
  { value: 'none', label: 'None', description: 'No Git client button' },
  { value: 'gitkraken', label: 'GitKraken', description: 'GitKraken Git GUI' },
  { value: 'tower', label: 'Tower', description: 'Tower Git Client' },
  { value: 'github-desktop', label: 'GitHub Desktop', description: 'GitHub Desktop' },
  { value: 'sourcetree', label: 'Sourcetree', description: 'Atlassian Sourcetree' },
  { value: 'fork', label: 'Fork', description: 'Fork Git Client' },
  { value: 'sublime-merge', label: 'Sublime Merge', description: 'Sublime Merge' },
  { value: 'custom', label: 'Custom', description: 'Specify custom Git client path' },
];
