<script setup lang="ts">
/**
 * RepoManagementPanel Component
 *
 * Sliding panel for managing repository configuration and lifecycle hooks.
 * Provides tabbed interface for Config and Hooks panels.
 */
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRepoConfigStore, useHooksStore, useWorktreeStore } from '../stores'
import { SPanel, SButton } from '@stuntrocket/ui'
import ConfigPanel from './repo/ConfigPanel.vue'
import HooksPanel from './repo/HooksPanel.vue'

const props = withDefaults(defineProps<{
  isOpen: boolean
  /** Initial tab to show when panel opens */
  initialTab?: 'config' | 'hooks'
}>(), {
  initialTab: 'config'
})

const emit = defineEmits<{
  close: []
}>()

type TabId = 'config' | 'hooks'

const activeTab = ref<TabId>(props.initialTab)
const configStore = useRepoConfigStore()
const hooksStore = useHooksStore()
const worktreeStore = useWorktreeStore()

const { selectedRepoName } = storeToRefs(worktreeStore)
const { loading: configLoading, error: configError } = storeToRefs(configStore)
const { loading: hooksLoading, error: hooksError } = storeToRefs(hooksStore)

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: 'config', label: 'Configuration', icon: 'cog' },
  { id: 'hooks', label: 'Hooks', icon: 'code' },
]

// Load data when panel opens and set initial tab
watch(() => props.isOpen, async (open) => {
  if (open) {
    activeTab.value = props.initialTab
    await loadData()
  }
})

// Reload when selected repo changes
watch(selectedRepoName, async () => {
  if (props.isOpen) {
    await loadData()
  }
})

async function loadData() {
  try {
    await Promise.all([
      configStore.loadEffectiveConfig(selectedRepoName.value ?? undefined),
      configStore.loadConfigFiles(selectedRepoName.value ?? undefined),
      hooksStore.loadHooks(selectedRepoName.value ?? undefined),
    ])
  } catch (e) {
    console.error('Failed to load repo management data:', e)
  }
}

function handleClose() {
  configStore.closeFile()
  hooksStore.closeHook()
  emit('close')
}

function handleRefresh() {
  loadData()
}
</script>

<template>
  <SPanel
    :open="isOpen"
    title="Repository Management"
    size="xl"
    @close="handleClose"
  >
    <template #icon>
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    </template>

    <div class="flex flex-col h-full">
      <!-- Tab Bar -->
      <div class="flex items-center gap-1 border-b border-white/[0.04] px-1 -mx-6 -mt-2 mb-4">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="[
            'px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors',
            'border-b-2 -mb-px',
            activeTab === tab.id
              ? 'text-accent border-accent bg-accent-muted'
              : 'text-text-muted border-transparent hover:text-text-primary hover:bg-surface-overlay',
          ]"
          @click="activeTab = tab.id"
        >
          <span class="flex items-center gap-2">
            <!-- Config Icon -->
            <svg v-if="tab.icon === 'cog'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.11 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <!-- Hooks Icon -->
            <svg v-else-if="tab.icon === 'code'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            {{ tab.label }}
          </span>
        </button>

        <!-- Refresh Button -->
        <div class="ml-auto px-2">
          <button
            :disabled="configLoading || hooksLoading"
            class="p-1.5 text-text-muted hover:text-text-primary rounded transition-colors disabled:opacity-50"
            title="Refresh"
            @click="handleRefresh"
          >
            <svg class="w-4 h-4" :class="{ 'animate-spin': configLoading || hooksLoading }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Tab Content -->
      <div class="flex-1 overflow-hidden">
        <Transition
          mode="out-in"
          enter-active-class="transition ease-out duration-150"
          enter-from-class="opacity-0 translate-x-2"
          enter-to-class="opacity-100 translate-x-0"
          leave-active-class="transition ease-in duration-100"
          leave-from-class="opacity-100 translate-x-0"
          leave-to-class="opacity-0 -translate-x-2"
        >
          <ConfigPanel
            v-if="activeTab === 'config'"
            :repo-name="selectedRepoName ?? undefined"
          />
          <HooksPanel
            v-else-if="activeTab === 'hooks'"
            :repo-name="selectedRepoName ?? undefined"
          />
        </Transition>
      </div>

      <!-- Error Display -->
      <Transition
        enter-active-class="transition ease-out duration-150"
        enter-from-class="opacity-0 translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition ease-in duration-100"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-2"
      >
        <div
          v-if="configError || hooksError"
          class="mt-4 p-3 bg-danger/10 border border-danger/20 rounded-lg"
        >
          <p class="text-sm text-danger">
            {{ configError?.message || hooksError?.message }}
          </p>
        </div>
      </Transition>
    </div>

    <template #footer>
      <div class="flex items-center justify-end w-full">
        <SButton
          variant="ghost"
          @click="handleClose"
        >
          Close
        </SButton>
      </div>
    </template>
  </SPanel>
</template>
