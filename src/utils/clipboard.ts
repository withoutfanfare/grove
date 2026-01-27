/**
 * Clipboard Utility Functions
 *
 * Provides cross-platform clipboard access for copying worktree information.
 * Uses Tauri's clipboard plugin with fallback to native clipboard API.
 */

import { writeText } from '@tauri-apps/plugin-clipboard-manager'

export interface ClipboardResult {
  success: boolean
  error?: string
}

/**
 * Copy text to the system clipboard.
 * Tries Tauri clipboard plugin first, falls back to native clipboard API.
 *
 * @param text - The text to copy
 * @returns A promise that resolves to a ClipboardResult
 */
export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  // Try Tauri clipboard plugin first
  try {
    await writeText(text)
    return { success: true }
  } catch (tauriError) {
    console.warn('[clipboard] Tauri clipboard failed, trying fallback:', tauriError)
    
    // Fallback to native clipboard API
    try {
      // Check if we're in a secure context with clipboard access
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text)
        return { success: true }
      }
      
      // Final fallback: use execCommand (deprecated but widely supported)
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
      
      throw new Error('execCommand copy failed')
    } catch (fallbackError) {
      console.error('[clipboard] All clipboard methods failed:', fallbackError)
      return {
        success: false,
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      }
    }
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
