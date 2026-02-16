<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import Dashboard from './components/Dashboard.vue';
import LoadingScreen from './components/LoadingScreen.vue';
import { ToastContainer } from './components/ui';
import { useWorktreeStore } from './stores/worktrees';
import { useRepos } from './composables';
import type { TrayWorktreeSelectedEvent } from './types';

const store = useWorktreeStore();
const { checkAvailability, fetchRepositories } = useRepos();

// Loading state
const isInitialising = ref(true);
const loadingMessage = ref('Checking environment');

// Listen for tray worktree selection events
let unlistenTray: UnlistenFn | null = null;

// Pending tray focus — applied once worktrees finish loading (different repo case)
const pendingTrayFocus = ref<string | null>(null);

// Watch for worktrees to finish loading, then apply pending focus
watch(() => store.loadingWorktrees, (isLoading, wasLoading) => {
  if (wasLoading && !isLoading && pendingTrayFocus.value) {
    store.focusWorktree(pendingTrayFocus.value);
    pendingTrayFocus.value = null;
  }
});

onMounted(async () => {
  try {
    // Check grove CLI availability
    loadingMessage.value = 'Checking grove CLI';
    const available = await checkAvailability();

    if (available) {
      // Load repositories
      loadingMessage.value = 'Loading repositories';
      await fetchRepositories();
    }

    // Set up tray event listener
    try {
      unlistenTray = await listen<TrayWorktreeSelectedEvent>(
        'tray_worktree_selected',
        (event) => {
          const { repo, branch } = event.payload;
          if (store.selectedRepoName === repo) {
            // Same repo — worktrees already loaded, focus directly.
            // Clear first so the watcher always fires (even if same branch).
            store.clearFocusedWorktree();
            requestAnimationFrame(() => {
              store.focusWorktree(branch);
            });
          } else {
            // Different repo — select it (triggers worktree fetch via Dashboard watcher)
            // Store pending focus to apply once worktrees finish loading
            pendingTrayFocus.value = branch;
            store.selectRepository(repo);
          }
        }
      );
    } catch (e) {
      console.error('[App] Failed to set up tray event listener:', e);
    }
  } finally {
    // Minimum display time for loading screen (for smooth UX)
    await new Promise(resolve => setTimeout(resolve, 800));
    isInitialising.value = false;
  }
});

onUnmounted(() => {
  if (unlistenTray) {
    unlistenTray();
    unlistenTray = null;
  }
});
</script>

<template>
  <!-- Loading screen with fade-out transition -->
  <Transition
    leave-active-class="transition-opacity duration-300 ease-out"
    leave-to-class="opacity-0"
  >
    <LoadingScreen v-if="isInitialising" :message="loadingMessage" />
  </Transition>
  
  <!-- Main app (no transition wrapper needed - Dashboard handles its own animations) -->
  <div v-if="!isInitialising">
    <Dashboard />
    <ToastContainer />
  </div>
</template>
