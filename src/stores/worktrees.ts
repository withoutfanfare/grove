import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Repository, Worktree, WtError, RecentWorktree } from '../types';

export const useWorktreeStore = defineStore('worktrees', () => {
  // State
  const repositories = ref<Repository[]>([]);
  const selectedRepoName = ref<string | null>(null);
  const worktrees = ref<Worktree[]>([]);
  const recentWorktrees = ref<RecentWorktree[]>([]);
  const loading = ref(false);
  const loadingWorktrees = ref(false);
  const loadingRecent = ref(false);
  const error = ref<WtError | null>(null);
  const wtAvailable = ref(true);
  const wtVersion = ref<string | null>(null);
  // Focused worktree (highlighted from tray selection)
  const focusedBranch = ref<string | null>(null);

  // Getters
  const selectedRepo = computed(() => {
    return repositories.value.find((r) => r.name === selectedRepoName.value) ?? null;
  });

  const hasRepositories = computed(() => repositories.value.length > 0);

  const totalWorktrees = computed(() => {
    return repositories.value.reduce((sum, repo) => sum + repo.worktrees, 0);
  });

  const dirtyWorktrees = computed(() => {
    return worktrees.value.filter((wt) => wt.dirty);
  });

  const cleanWorktrees = computed(() => {
    return worktrees.value.filter((wt) => !wt.dirty);
  });

  // Actions
  function setRepositories(repos: Repository[]) {
    repositories.value = repos;
    // If no repo is selected and we have repos, select the first one
    if (!selectedRepoName.value && repos.length > 0) {
      selectedRepoName.value = repos[0].name;
    }
  }

  function setWorktrees(wts: Worktree[]) {
    worktrees.value = wts;
  }

  function selectRepository(name: string) {
    if (repositories.value.some((r) => r.name === name)) {
      selectedRepoName.value = name;
      // Clear worktrees and show loading state to prevent flash of empty content
      worktrees.value = [];
      loadingWorktrees.value = true;
      // Clear any focused branch when switching repos
      focusedBranch.value = null;
    }
  }

  function focusWorktree(branch: string) {
    focusedBranch.value = branch;
  }

  function clearFocusedWorktree() {
    focusedBranch.value = null;
  }

  function setLoading(isLoading: boolean) {
    loading.value = isLoading;
  }

  function setLoadingWorktrees(isLoading: boolean) {
    loadingWorktrees.value = isLoading;
  }

  function setRecentWorktrees(recent: RecentWorktree[]) {
    recentWorktrees.value = recent;
  }

  function setLoadingRecent(isLoading: boolean) {
    loadingRecent.value = isLoading;
  }

  function setError(err: WtError | null) {
    error.value = err;
  }

  function clearError() {
    error.value = null;
  }

  function setWtAvailable(available: boolean) {
    wtAvailable.value = available;
  }

  function setWtVersion(version: string | null) {
    wtVersion.value = version;
  }

  function reset() {
    repositories.value = [];
    selectedRepoName.value = null;
    worktrees.value = [];
    recentWorktrees.value = [];
    loading.value = false;
    loadingWorktrees.value = false;
    loadingRecent.value = false;
    error.value = null;
    focusedBranch.value = null;
  }

  return {
    // State
    repositories,
    selectedRepoName,
    worktrees,
    recentWorktrees,
    loading,
    loadingWorktrees,
    loadingRecent,
    error,
    wtAvailable,
    wtVersion,
    focusedBranch,
    // Getters
    selectedRepo,
    hasRepositories,
    totalWorktrees,
    dirtyWorktrees,
    cleanWorktrees,
    // Actions
    setRepositories,
    setWorktrees,
    setRecentWorktrees,
    selectRepository,
    setLoading,
    setLoadingWorktrees,
    setLoadingRecent,
    setError,
    clearError,
    setWtAvailable,
    setWtVersion,
    reset,
    focusWorktree,
    clearFocusedWorktree,
  };
});
