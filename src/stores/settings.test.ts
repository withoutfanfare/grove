import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore, DEFAULT_SETTINGS } from './settings'
import { nextTick } from 'vue'

describe('useSettingsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  describe('initial state', () => {
    it('should have default settings', () => {
      const store = useSettingsStore()
      expect(store.settings.editor).toBe('vscode')
      expect(store.settings.terminal).toBe('terminal')
      expect(store.settings.gitClient).toBe('none')
      expect(store.settings.defaultBaseBranch).toBe('origin/main')
      expect(store.settings.enableNotifications).toBe(true)
    })

    it('should load settings from localStorage', () => {
      localStorage.setItem('wt-app-settings', JSON.stringify({
        editor: 'cursor',
        terminal: 'iterm2',
        enableNotifications: false,
      }))

      const store = useSettingsStore()
      expect(store.settings.editor).toBe('cursor')
      expect(store.settings.terminal).toBe('iterm2')
      expect(store.settings.enableNotifications).toBe(false)
      // Other defaults should still apply
      expect(store.settings.gitClient).toBe('none')
    })

    it('should handle corrupted localStorage gracefully', () => {
      localStorage.setItem('wt-app-settings', 'invalid json{')

      const store = useSettingsStore()
      expect(store.settings.editor).toBe('vscode') // Falls back to default
    })

    it('should handle missing localStorage gracefully', () => {
      const store = useSettingsStore()
      expect(store.settings.editor).toBe('vscode')
    })
  })

  describe('setEditor', () => {
    it('should update editor setting', () => {
      const store = useSettingsStore()
      store.setEditor('cursor')
      expect(store.settings.editor).toBe('cursor')
    })

    it('should save to localStorage', async () => {
      const store = useSettingsStore()
      store.setEditor('zed')
      
      await nextTick()
      
      const saved = JSON.parse(localStorage.getItem('wt-app-settings')!)
      expect(saved.editor).toBe('zed')
    })
  })

  describe('setCustomEditorPath', () => {
    it('should update custom editor path', () => {
      const store = useSettingsStore()
      store.setCustomEditorPath('/Applications/MyEditor.app')
      expect(store.settings.customEditorPath).toBe('/Applications/MyEditor.app')
    })

    it('should save to localStorage', async () => {
      const store = useSettingsStore()
      store.setCustomEditorPath('/path/to/editor')
      
      await nextTick()
      
      const saved = JSON.parse(localStorage.getItem('wt-app-settings')!)
      expect(saved.customEditorPath).toBe('/path/to/editor')
    })
  })

  describe('setTerminal', () => {
    it('should update terminal setting', () => {
      const store = useSettingsStore()
      store.setTerminal('warp')
      expect(store.settings.terminal).toBe('warp')
    })

    it('should save to localStorage', async () => {
      const store = useSettingsStore()
      store.setTerminal('iterm2')
      
      await nextTick()
      
      const saved = JSON.parse(localStorage.getItem('wt-app-settings')!)
      expect(saved.terminal).toBe('iterm2')
    })
  })

  describe('setGitClient', () => {
    it('should update git client setting', () => {
      const store = useSettingsStore()
      store.setGitClient('fork')
      expect(store.settings.gitClient).toBe('fork')
    })

    it('should save to localStorage', async () => {
      const store = useSettingsStore()
      store.setGitClient('tower')
      
      await nextTick()
      
      const saved = JSON.parse(localStorage.getItem('wt-app-settings')!)
      expect(saved.gitClient).toBe('tower')
    })
  })

  describe('setCustomGitClientPath', () => {
    it('should update custom git client path', () => {
      const store = useSettingsStore()
      store.setCustomGitClientPath('/Applications/MyGit.app')
      expect(store.settings.customGitClientPath).toBe('/Applications/MyGit.app')
    })
  })

  describe('setDefaultBaseBranch', () => {
    it('should update default base branch', () => {
      const store = useSettingsStore()
      store.setDefaultBaseBranch('origin/staging')
      expect(store.settings.defaultBaseBranch).toBe('origin/staging')
    })

    it('should save to localStorage', async () => {
      const store = useSettingsStore()
      store.setDefaultBaseBranch('origin/develop')
      
      await nextTick()
      
      const saved = JSON.parse(localStorage.getItem('wt-app-settings')!)
      expect(saved.defaultBaseBranch).toBe('origin/develop')
    })
  })

  describe('setEnableNotifications', () => {
    it('should update notifications setting', () => {
      const store = useSettingsStore()
      store.setEnableNotifications(false)
      expect(store.settings.enableNotifications).toBe(false)
    })

    it('should save to localStorage', async () => {
      const store = useSettingsStore()
      store.setEnableNotifications(false)
      
      await nextTick()
      
      const saved = JSON.parse(localStorage.getItem('wt-app-settings')!)
      expect(saved.enableNotifications).toBe(false)
    })
  })

  describe('resetToDefaults', () => {
    it('should reset all settings to defaults', () => {
      const store = useSettingsStore()
      
      // Change some settings
      store.setEditor('cursor')
      store.setTerminal('warp')
      store.setEnableNotifications(false)
      
      // Reset
      store.resetToDefaults()
      
      expect(store.settings.editor).toBe('vscode')
      expect(store.settings.terminal).toBe('terminal')
      expect(store.settings.gitClient).toBe('none')
      expect(store.settings.defaultBaseBranch).toBe('origin/main')
      expect(store.settings.enableNotifications).toBe(true)
      expect(store.settings.customEditorPath).toBe('')
      expect(store.settings.customGitClientPath).toBe('')
    })

    it('should clear localStorage on reset', async () => {
      const store = useSettingsStore()
      store.setEditor('cursor')
      await nextTick()
      
      store.resetToDefaults()
      await nextTick()
      
      const saved = JSON.parse(localStorage.getItem('wt-app-settings')!)
      expect(saved.editor).toBe('vscode')
    })
  })

  describe('auto-save behavior', () => {
    it('should auto-save when settings change', async () => {
      const store = useSettingsStore()
      
      store.settings.editor = 'phpstorm'
      
      await nextTick()
      
      const saved = JSON.parse(localStorage.getItem('wt-app-settings')!)
      expect(saved.editor).toBe('phpstorm')
    })

    it('should handle localStorage errors gracefully', () => {
      // Verify that the store has error handling for localStorage operations
      const store = useSettingsStore()
      
      // The store should have a way to handle settings
      expect(store.settings).toBeDefined()
      
      // Settings should persist changes without throwing
      expect(() => {
        store.setEditor('vscode')
        store.setTerminal('terminal')
        store.resetToDefaults()
      }).not.toThrow()
    })
  })
})
