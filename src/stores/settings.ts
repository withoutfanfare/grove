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

export interface Settings {
  editor: EditorChoice;
  customEditorPath: string;
  terminal: TerminalChoice;
  defaultBaseBranch: string;
  enableNotifications: boolean;
}

const STORAGE_KEY = 'wt-app-settings';

const DEFAULT_SETTINGS: Settings = {
  editor: 'vscode',
  customEditorPath: '',
  terminal: 'terminal',
  defaultBaseBranch: 'origin/staging',
  enableNotifications: true,
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

  function setDefaultBaseBranch(branch: string) {
    settings.value.defaultBaseBranch = branch;
  }

  function setEnableNotifications(enabled: boolean) {
    settings.value.enableNotifications = enabled;
  }

  function resetToDefaults() {
    settings.value = { ...DEFAULT_SETTINGS };
  }

  return {
    settings,
    setEditor,
    setCustomEditorPath,
    setTerminal,
    setDefaultBaseBranch,
    setEnableNotifications,
    resetToDefaults,
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
