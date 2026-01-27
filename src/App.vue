<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
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

onMounted(async () => {
  try {
    // Check wt CLI availability
    loadingMessage.value = 'Checking wt CLI';
    const available = await checkAvailability();
    
    if (available) {
      // Load repositories
      loadingMessage.value = 'Loading repositories';
      await fetchRepositories();
    }
    
    // Set up tray event listener
    unlistenTray = await listen<TrayWorktreeSelectedEvent>(
      'tray_worktree_selected',
      (event) => {
        const { repo, branch } = event.payload;
        // Navigate to the selected repository and focus the worktree
        store.selectRepository(repo);
        // Set focus after a delay to allow worktrees to load
        setTimeout(() => {
          store.focusWorktree(branch);
        }, 500);
      }
    );
  } finally {
    // Minimum display time for loading screen (for smooth UX)
    await new Promise(resolve => setTimeout(resolve, 1200));
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
