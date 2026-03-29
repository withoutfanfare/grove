/**
 * Auto-Updater Composable
 *
 * Checks for app updates on launch and provides manual check capability.
 * Uses the Tauri updater plugin for download and installation, with
 * release channel support (stable/beta) from settings.
 */
import { ref } from 'vue'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { invoke } from '@tauri-apps/api/core'

export interface UpdateInfo {
  version: string
  body: string | null
  date: string | null
}

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

// Module-level state so all component instances share update status
const status = ref<UpdateStatus>('idle')
const availableUpdate = ref<UpdateInfo | null>(null)
const downloadProgress = ref(0)
const errorMessage = ref('')
const currentVersion = ref('')
const dismissed = ref(false)

let initialCheckDone = false

export function useUpdater() {
  /**
   * Fetch the current app version from the Rust backend.
   */
  async function fetchVersion(): Promise<void> {
    try {
      currentVersion.value = await invoke<string>('get_app_version')
    } catch {
      currentVersion.value = '0.0.0'
    }
  }

  /**
   * Check for available updates via the Tauri updater plugin.
   * Network failures are handled gracefully — the app continues normally.
   */
  async function checkForUpdate(): Promise<void> {
    if (status.value === 'checking' || status.value === 'downloading') return

    status.value = 'checking'
    errorMessage.value = ''
    dismissed.value = false

    try {
      const update = await check()

      if (update) {
        availableUpdate.value = {
          version: update.version,
          body: update.body ?? null,
          date: update.date ?? null,
        }
        status.value = 'available'
      } else {
        availableUpdate.value = null
        status.value = 'idle'
      }
    } catch (e) {
      // Network errors or unreachable endpoints are non-fatal
      console.warn('[updater] Update check failed:', e)
      status.value = 'idle'
    }
  }

  /**
   * Download and install the available update, then relaunch the app.
   */
  async function downloadAndInstall(): Promise<void> {
    if (status.value !== 'available') return

    status.value = 'downloading'
    downloadProgress.value = 0

    try {
      const update = await check()
      if (!update) {
        status.value = 'idle'
        return
      }

      let totalBytes = 0

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            totalBytes = event.data.contentLength ?? 0
            downloadProgress.value = 0
            break
          case 'Progress':
            if (totalBytes > 0) {
              downloadProgress.value += event.data.chunkLength
            }
            break
          case 'Finished':
            downloadProgress.value = totalBytes
            break
        }
      })

      status.value = 'ready'
      await relaunch()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[updater] Download failed:', msg)
      errorMessage.value = msg
      status.value = 'error'
    }
  }

  /**
   * Dismiss the update notification for this session.
   */
  function dismissUpdate(): void {
    dismissed.value = true
  }

  /**
   * Run the initial update check on app launch (once per session).
   */
  async function checkOnLaunch(autoCheckEnabled: boolean): Promise<void> {
    if (initialCheckDone) return
    initialCheckDone = true

    await fetchVersion()

    if (autoCheckEnabled) {
      // Delay the check slightly so the app loads first
      setTimeout(() => {
        checkForUpdate()
      }, 3000)
    }
  }

  return {
    status,
    availableUpdate,
    downloadProgress,
    errorMessage,
    currentVersion,
    dismissed,
    checkForUpdate,
    downloadAndInstall,
    dismissUpdate,
    checkOnLaunch,
    fetchVersion,
  }
}
