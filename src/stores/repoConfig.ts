import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type {
  Config,
  ConfigLayer,
  ConfigFileMeta,
  ConfigFileContents,
  ConfigKeyUpdate,
  WtError,
} from '../types';
import { isWtError } from '../types';

export const useRepoConfigStore = defineStore('repoConfig', () => {
  // State
  const effectiveConfig = ref<Config | null>(null);
  const configFiles = ref<ConfigFileMeta[]>([]);
  const openFile = ref<ConfigFileContents | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<WtError | null>(null);

  // Getters
  const hasConfig = computed(() => effectiveConfig.value !== null);

  const globalConfig = computed(() => 
    configFiles.value.find(f => f.layer === 'global')
  );

  const projectConfig = computed(() =>
    configFiles.value.find(f => f.layer === 'project')
  );

  const repoConfig = computed(() =>
    configFiles.value.find(f => f.layer === 'repo')
  );

  // Actions
  async function loadEffectiveConfig(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      effectiveConfig.value = await invoke<Config>('get_config');
    } catch (e) {
      error.value = isWtError(e) ? e : { code: 'UNKNOWN', message: String(e) };
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function loadConfigFiles(repoName?: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      configFiles.value = await invoke<ConfigFileMeta[]>('get_config_files', {
        repoName: repoName ?? null,
      });
    } catch (e) {
      error.value = isWtError(e) ? e : { code: 'UNKNOWN', message: String(e) };
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function openConfigFile(layer: ConfigLayer, repoName?: string): Promise<ConfigFileContents> {
    loading.value = true;
    error.value = null;
    try {
      const contents = await invoke<ConfigFileContents>('read_config_file', {
        layer,
        repoName: repoName ?? null,
      });
      openFile.value = contents;
      return contents;
    } catch (e) {
      error.value = isWtError(e) ? e : { code: 'UNKNOWN', message: String(e) };
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function saveConfigFile(
    layer: ConfigLayer,
    content: string,
    repoName?: string
  ): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await invoke('write_config_file', {
        layer,
        repoName: repoName ?? null,
        content,
      });
      // Reload the file to get updated metadata
      await openConfigFile(layer, repoName);
      // Also refresh the effective config
      await loadEffectiveConfig();
    } catch (e) {
      error.value = isWtError(e) ? e : { code: 'UNKNOWN', message: String(e) };
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function updateConfigKeys(
    layer: ConfigLayer,
    updates: ConfigKeyUpdate[],
    repoName?: string
  ): Promise<ConfigFileContents> {
    saving.value = true;
    error.value = null;
    try {
      const contents = await invoke<ConfigFileContents>('update_config_keys', {
        layer,
        repoName: repoName ?? null,
        updates,
      });
      openFile.value = contents;
      // Also refresh the effective config
      await loadEffectiveConfig();
      return contents;
    } catch (e) {
      error.value = isWtError(e) ? e : { code: 'UNKNOWN', message: String(e) };
      throw e;
    } finally {
      saving.value = false;
    }
  }

  function closeFile(): void {
    openFile.value = null;
  }

  function clearError(): void {
    error.value = null;
  }

  function reset(): void {
    effectiveConfig.value = null;
    configFiles.value = [];
    openFile.value = null;
    loading.value = false;
    saving.value = false;
    error.value = null;
  }

  return {
    // State
    effectiveConfig,
    configFiles,
    openFile,
    loading,
    saving,
    error,
    // Getters
    hasConfig,
    globalConfig,
    projectConfig,
    repoConfig,
    // Actions
    loadEffectiveConfig,
    loadConfigFiles,
    openConfigFile,
    saveConfigFile,
    updateConfigKeys,
    closeFile,
    clearError,
    reset,
  };
});
