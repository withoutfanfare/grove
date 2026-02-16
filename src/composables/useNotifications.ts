import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useAppStore } from './useAppStore';

/**
 * Composable for sending native OS notifications.
 *
 * Notifications are only sent when the Grove window is not focused,
 * to avoid duplicating in-app toast messages.
 */
export function useNotifications() {
  const appStore = useAppStore();

  /**
   * Ensure notification permission is granted.
   * Requests permission on first use if not already granted.
   */
  async function ensurePermission(): Promise<boolean> {
    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        const result = await requestPermission();
        granted = result === 'granted';
      }
      return granted;
    } catch {
      return false;
    }
  }

  /**
   * Check if the main window is currently focused.
   */
  async function isWindowFocused(): Promise<boolean> {
    try {
      const window = getCurrentWindow();
      return await window.isFocused();
    } catch {
      return true; // Assume focused if we can't check
    }
  }

  /**
   * Send a native notification if the window is not focused
   * and notifications are enabled.
   */
  async function notify(title: string, body: string): Promise<void> {
    try {
      const enabled = await appStore.getNotificationsEnabled();
      if (!enabled) return;

      const focused = await isWindowFocused();
      if (focused) return;

      const hasPermission = await ensurePermission();
      if (!hasPermission) return;

      sendNotification({ title, body });
    } catch {
      // Silently fail - notifications are non-critical
    }
  }

  /**
   * Notify on pull-all completion.
   */
  async function notifyPullAllComplete(
    updated: number,
    failed: number
  ): Promise<void> {
    const parts: string[] = [];
    if (updated > 0) parts.push(`${updated} updated`);
    if (failed > 0) parts.push(`${failed} failed`);
    await notify('Pull All', parts.join(', '));
  }

  /**
   * Notify on prune completion.
   */
  async function notifyPruneComplete(
    count: number,
    repoName: string
  ): Promise<void> {
    await notify('Prune', `Pruned ${count} worktrees from ${repoName}`);
  }

  /**
   * Notify on sync completion.
   */
  async function notifySyncComplete(repoName: string): Promise<void> {
    await notify('Sync', `${repoName} synced successfully`);
  }

  /**
   * Notify on hook execution failure.
   */
  async function notifyHookFailed(
    hookName: string,
    repoName: string
  ): Promise<void> {
    await notify('Hook Failed', `${hookName} failed in ${repoName}`);
  }

  return {
    ensurePermission,
    notify,
    notifyPullAllComplete,
    notifyPruneComplete,
    notifySyncComplete,
    notifyHookFailed,
  };
}
