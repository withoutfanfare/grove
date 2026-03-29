<script setup lang="ts">
/**
 * UpdateBanner Component
 *
 * Non-intrusive notification banner displayed at the top of the dashboard
 * when a new version of Grove is available. Shows release notes and
 * provides download/install and dismiss actions.
 */
import { computed } from 'vue'
import { useUpdater } from '../composables'
import { SButton } from '@stuntrocket/ui'

const {
  status,
  availableUpdate,
  dismissed,
  currentVersion,
  downloadAndInstall,
  dismissUpdate,
} = useUpdater()

const isVisible = computed(() => {
  return status.value === 'available' && availableUpdate.value && !dismissed.value
})

const isDownloading = computed(() => status.value === 'downloading')

const releaseNotes = computed(() => {
  if (!availableUpdate.value?.body) return null
  // Truncate very long release notes for the banner
  const body = availableUpdate.value.body
  return body.length > 300 ? body.slice(0, 300) + '...' : body
})
</script>

<template>
  <Transition
    enter-active-class="transition ease-out duration-200"
    enter-from-class="opacity-0 -translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition ease-in duration-150"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 -translate-y-2"
  >
    <div
      v-if="isVisible || isDownloading"
      class="mx-4 mt-3 rounded-lg border border-accent/20 bg-accent/[0.08] px-4 py-3"
    >
      <div class="flex items-start gap-3">
        <!-- Update icon -->
        <div class="mt-0.5 shrink-0 text-accent">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        </div>

        <!-- Content -->
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-text-primary">
            <template v-if="isDownloading">
              Downloading Grove {{ availableUpdate?.version }}...
            </template>
            <template v-else>
              Grove {{ availableUpdate?.version }} is available
            </template>
            <span class="ml-1.5 text-xs text-text-muted">
              (current: {{ currentVersion }})
            </span>
          </p>

          <p v-if="releaseNotes && !isDownloading" class="mt-1 text-xs leading-relaxed text-text-secondary">
            {{ releaseNotes }}
          </p>
        </div>

        <!-- Actions -->
        <div v-if="!isDownloading" class="flex shrink-0 items-center gap-2">
          <SButton
            variant="ghost"
            size="sm"
            @click="dismissUpdate"
          >
            Later
          </SButton>
          <SButton
            variant="primary"
            size="sm"
            @click="downloadAndInstall"
          >
            Update Now
          </SButton>
        </div>

        <!-- Downloading spinner -->
        <div v-else class="shrink-0">
          <svg class="h-5 w-5 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </div>
    </div>
  </Transition>
</template>
