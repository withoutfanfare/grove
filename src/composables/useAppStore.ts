import { load, Store } from '@tauri-apps/plugin-store';
import { ref } from 'vue';

/**
 * Keys persisted in the Tauri store.
 */
interface AppStoreData {
  lastSelectedRepo: string | null;
  sidebarWidth: number;
  sortOrder: string;
  expandedSections: Record<string, boolean>;
  recentWorktrees: string[];
  notificationsEnabled: boolean;
}

const STORE_FILE = 'grove-preferences.json';

const defaults: AppStoreData = {
  lastSelectedRepo: null,
  sidebarWidth: 280,
  sortOrder: 'name',
  expandedSections: {},
  recentWorktrees: [],
  notificationsEnabled: true,
};

let storeInstance: Store | null = null;
const isReady = ref(false);

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await load(STORE_FILE, {
      defaults: defaults as unknown as Record<string, unknown>,
      autoSave: true,
    });
    isReady.value = true;
  }
  return storeInstance;
}

/**
 * Persistent app store using Tauri's store plugin.
 *
 * Stores user preferences that survive app restarts, separate from
 * the grove CLI configuration.
 */
export function useAppStore() {
  async function get<K extends keyof AppStoreData>(key: K): Promise<AppStoreData[K]> {
    try {
      const store = await getStore();
      const value = await store.get<AppStoreData[K]>(key);
      return value ?? defaults[key];
    } catch {
      return defaults[key];
    }
  }

  async function set<K extends keyof AppStoreData>(key: K, value: AppStoreData[K]): Promise<void> {
    try {
      const store = await getStore();
      await store.set(key, value);
    } catch {
      // Silently fail - preferences are non-critical
    }
  }

  async function getLastSelectedRepo(): Promise<string | null> {
    return get('lastSelectedRepo');
  }

  async function setLastSelectedRepo(repoName: string | null): Promise<void> {
    return set('lastSelectedRepo', repoName);
  }

  async function getSidebarWidth(): Promise<number> {
    return get('sidebarWidth');
  }

  async function setSidebarWidth(width: number): Promise<void> {
    return set('sidebarWidth', width);
  }

  async function getSortOrder(): Promise<string> {
    return get('sortOrder');
  }

  async function setSortOrder(order: string): Promise<void> {
    return set('sortOrder', order);
  }

  async function getExpandedSections(): Promise<Record<string, boolean>> {
    return get('expandedSections');
  }

  async function setExpandedSections(sections: Record<string, boolean>): Promise<void> {
    return set('expandedSections', sections);
  }

  async function getNotificationsEnabled(): Promise<boolean> {
    return get('notificationsEnabled');
  }

  async function setNotificationsEnabled(enabled: boolean): Promise<void> {
    return set('notificationsEnabled', enabled);
  }

  return {
    isReady,
    get,
    set,
    getLastSelectedRepo,
    setLastSelectedRepo,
    getSidebarWidth,
    setSidebarWidth,
    getSortOrder,
    setSortOrder,
    getExpandedSections,
    setExpandedSections,
    getNotificationsEnabled,
    setNotificationsEnabled,
  };
}
