/**
 * Clipboard Utility Functions
 *
 * Provides cross-platform clipboard access for copying worktree information.
 * Uses Tauri's clipboard plugin with fallback to native clipboard API.
 */

import { invoke } from '@tauri-apps/api/core'

export interface ClipboardResult {
  success: boolean
  error?: string
}

/**
 * Copy text to the system clipboard.
 * Uses Tauri's clipboard-manager plugin command directly,
 * with fallback to the Web Clipboard API.
 *
 * @param text - The text to copy
 * @returns A promise that resolves to a ClipboardResult
 */
export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  // Try Tauri clipboard plugin command directly
  try {
    await invoke('plugin:clipboard-manager|write_text', { text })
    return { success: true }
  } catch (tauriError) {
    console.warn('[clipboard] Tauri clipboard plugin failed:', tauriError)
  }

  // Fallback to Web Clipboard API
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      return { success: true }
    }
  } catch (webError) {
    console.warn('[clipboard] Web Clipboard API failed:', webError)
  }

  // Final fallback: textarea + execCommand (deprecated but widely supported)
  try {
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-9999px'
    textArea.style.top = '-9999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()

    const successful = document.execCommand('copy')
    document.body.removeChild(textArea)

    if (successful) {
      return { success: true }
    }
  } catch (execError) {
    console.warn('[clipboard] execCommand fallback failed:', execError)
  }

  return {
    success: false,
    error: 'All clipboard methods failed. Check application permissions.',
  }
}

/**
 * Copy a worktree path to the clipboard.
 *
 * @param path - Full filesystem path to the worktree
 * @returns A promise that resolves to a ClipboardResult
 */
export async function copyPath(path: string): Promise<ClipboardResult> {
  return copyToClipboard(path)
}

/**
 * Copy a branch name to the clipboard.
 *
 * @param branch - Git branch name
 * @returns A promise that resolves to a ClipboardResult
 */
export async function copyBranch(branch: string): Promise<ClipboardResult> {
  return copyToClipboard(branch)
}

/**
 * Copy a URL to the clipboard.
 *
 * @param url - Development URL
 * @returns A promise that resolves to a ClipboardResult
 */
export async function copyUrl(url: string): Promise<ClipboardResult> {
  return copyToClipboard(url)
}

/**
 * Copy a cd command with proper quoting to the clipboard.
 * The path is wrapped in double quotes to handle spaces and special characters.
 *
 * @param path - Full filesystem path to the worktree
 * @returns A promise that resolves to a ClipboardResult
 */
export async function copyCdCommand(path: string): Promise<ClipboardResult> {
  const command = `cd "${path}"`
  return copyToClipboard(command)
}
