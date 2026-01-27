/**
 * Clipboard Utility Functions
 *
 * Provides cross-platform clipboard access for copying worktree information.
 * Uses Tauri's clipboard plugin for reliable clipboard access in the Tauri WebView.
 */

import { writeText } from '@tauri-apps/plugin-clipboard-manager'

export interface ClipboardResult {
  success: boolean
  error?: string
}

/**
 * Copy text to the system clipboard.
 *
 * @param text - The text to copy
 * @returns A promise that resolves to a ClipboardResult
 */
export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  try {
    await writeText(text)
    return { success: true }
  } catch (error) {
    console.error('[clipboard] Failed to copy:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
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
