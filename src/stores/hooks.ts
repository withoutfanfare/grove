import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type {
  HookEvent,
  HookScope,
  HookScriptMeta,
  HookScriptContents,
  WtError,
} from '../types';
import { isWtError } from '../types';

export const useHooksStore = defineStore('hooks', () => {
  // State
  const hooks = ref<HookScriptMeta[]>([]);
  const openHook = ref<HookScriptContents | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<WtError | null>(null);

  // Getters
  const hasHooks = computed(() => hooks.value.length > 0);

  const hooksByEvent = computed(() => {
    const grouped: Record<HookEvent, HookScriptMeta[]> = {
      pre_add: [],
      post_add: [],
      post_pull: [],
      post_switch: [],
      post_sync: [],
      pre_rm: [],
      post_rm: [],
    };
    for (const hook of hooks.value) {
      grouped[hook.event].push(hook);
    }
    return grouped;
  });

  const enabledHooks = computed(() =>
    hooks.value.filter(h => h.security.executable && h.security.allowed_to_run)
  );

  const disabledHooks = computed(() =>
    hooks.value.filter(h => !h.security.executable || !h.security.allowed_to_run)
  );

  // Actions
  async function loadHooks(repoName?: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      hooks.value = await invoke<HookScriptMeta[]>('list_hooks', {
        repoName: repoName ?? null,
      });
    } catch (e) {
      error.value = isWtError(e) ? e : { code: 'UNKNOWN', message: String(e) };
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function readHook(path: string): Promise<HookScriptContents> {
    loading.value = true;
    error.value = null;
    try {
      const contents = await invoke<HookScriptContents>('read_hook', { path });
      openHook.value = contents;
      return contents;
    } catch (e) {
      error.value = isWtError(e) ? e : { code: 'UNKNOWN', message: String(e) };
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function writeHook(path: string, content: string): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await invoke('write_hook', { path, content });
      // Reload the hook to get updated metadata
      await readHook(path);
    } catch (e) {
      error.value = isWtError(e) ? e : { code: 'UNKNOWN', message: String(e) };
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function createHook(
    event: HookEvent,
    scope: HookScope,
    fileName: string,
    content: string,
    repoName?: string
  ): Promise<HookScriptMeta> {
    saving.value = true;
    error.value = null;
    try {
      const meta = await invoke<HookScriptMeta>('create_hook', {
        event,
        scope,
        repoName: repoName ?? null,
        fileName,
        content,
      });
      // Reload hooks list
      await loadHooks(repoName);
      return meta;
    } catch (e) {
      error.value = isWtError(e) ? e : { code: 'UNKNOWN', message: String(e) };
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function deleteHook(path: string, repoName?: string): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await invoke('delete_hook', { path });
      // Close if this was the open hook
      if (openHook.value?.meta.path === path) {
        openHook.value = null;
      }
      // Reload hooks list
      await loadHooks(repoName);
    } catch (e) {
      error.value = isWtError(e) ? e : { code: 'UNKNOWN', message: String(e) };
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function renameHook(
    path: string,
    newFileName: string,
    repoName?: string
  ): Promise<HookScriptMeta> {
    saving.value = true;
    error.value = null;
    try {
      const meta = await invoke<HookScriptMeta>('rename_hook', {
        path,
        newFileName,
      });
      // Update open hook if it was renamed
      if (openHook.value?.meta.path === path) {
        openHook.value = { ...openHook.value, meta };
      }
      // Reload hooks list
      await loadHooks(repoName);
      return meta;
    } catch (e) {
      error.value = isWtError(e) ? e : { code: 'UNKNOWN', message: String(e) };
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function setHookExecutable(
    path: string,
    executable: boolean,
    repoName?: string
  ): Promise<HookScriptMeta> {
    saving.value = true;
    error.value = null;
    try {
      const meta = await invoke<HookScriptMeta>('set_hook_executable', {
        path,
        executable,
      });
      // Update open hook if it was toggled
      if (openHook.value?.meta.path === path) {
        openHook.value = { ...openHook.value, meta };
      }
      // Reload hooks list
      await loadHooks(repoName);
      return meta;
    } catch (e) {
      error.value = isWtError(e) ? e : { code: 'UNKNOWN', message: String(e) };
      throw e;
    } finally {
      saving.value = false;
    }
  }

  function closeHook(): void {
    openHook.value = null;
  }

  function clearError(): void {
    error.value = null;
  }

  function reset(): void {
    hooks.value = [];
    openHook.value = null;
    loading.value = false;
    saving.value = false;
    error.value = null;
  }

  return {
    // State
    hooks,
    openHook,
    loading,
    saving,
    error,
    // Getters
    hasHooks,
    hooksByEvent,
    enabledHooks,
    disabledHooks,
    // Actions
    loadHooks,
    readHook,
    writeHook,
    createHook,
    deleteHook,
    renameHook,
    setHookExecutable,
    closeHook,
    clearError,
    reset,
  };
});
