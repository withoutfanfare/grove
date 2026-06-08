import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Repository, Worktree, WtError, RecentWorktree } from '../types';
import { useAppStore } from '../composables/useAppStore';

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
  // Flag to expand details when focusing a worktree (e.g., from Recent list)
  const expandOnFocus = ref(false);
  // Flag indicating the current focus should auto-clear (transient pulse from tray/Recent)
  const focusTransient = ref(false);
  // Lazy loading: track which repos have had worktrees fetched this session
  const loadedRepos = ref<Set<string>>(new Set());
  // Cache of worktrees per repo for lazy loading
  const worktreeCache = ref<Record<string, Worktree[]>>({});
  // Multi-selection: set of selected worktree paths (per-repo, cleared on switch)
  const selectedPaths = ref<Set<string>>(new Set());
  // Anchor for shift-click range selection
  const lastSelectedPath = ref<string | null>(null);

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

  const selectionCount = computed(() => selectedPaths.value.size);

  // Persistent store for remembering selection across restarts
  const appStore = useAppStore();

  // Actions
  function setRepositories(repos: Repository[]) {
    repositories.value = repos;
  }

  function setWorktrees(wts: Worktree[]) {
    worktrees.value = wts;
    // Drop any selected paths that no longer exist (e.g. after a batch delete)
    if (selectedPaths.value.size > 0) {
      const valid = new Set(wts.map((w) => w.path));
      const pruned = new Set([...selectedPaths.value].filter((p) => valid.has(p)));
      if (pruned.size !== selectedPaths.value.size) {
        selectedPaths.value = pruned;
      }
    }
    // Cache for lazy loading
    if (selectedRepoName.value) {
      loadedRepos.value.add(selectedRepoName.value);
      worktreeCache.value[selectedRepoName.value] = wts;
    }
  }

  /**
   * Check if a repo's worktrees have been loaded this session
   */
  function isRepoLoaded(repoName: string): boolean {
    return loadedRepos.value.has(repoName);
  }

  /**
   * Get cached worktrees for a repo (returns empty array if not loaded)
   */
  function getCachedWorktrees(repoName: string): Worktree[] {
    return worktreeCache.value[repoName] ?? [];
  }

  function toggleSelection(path: string) {
    const next = new Set(selectedPaths.value);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    selectedPaths.value = next;
    // Anchor tracks the last item that was selected, not deselected
    if (next.has(path)) {
      lastSelectedPath.value = path;
    }
  }

  function setSelection(paths: string[]) {
    selectedPaths.value = new Set(paths);
    lastSelectedPath.value = null;
  }

  function clearSelection() {
    selectedPaths.value = new Set();
    lastSelectedPath.value = null;
  }

  function selectRange(toPath: string, orderedPaths: string[]) {
    const anchor = lastSelectedPath.value;
    const next = new Set(selectedPaths.value);
    if (anchor && orderedPaths.includes(anchor) && orderedPaths.includes(toPath)) {
      const a = orderedPaths.indexOf(anchor);
      const b = orderedPaths.indexOf(toPath);
      const [start, end] = a < b ? [a, b] : [b, a];
      for (let i = start; i <= end; i++) {
        next.add(orderedPaths[i]);
      }
    } else {
      next.add(toPath);
    }
    selectedPaths.value = next;
    lastSelectedPath.value = toPath;
  }

  function selectRepository(name: string) {
    if (repositories.value.some((r) => r.name === name)) {
      selectedRepoName.value = name;
      // Clear any focused branch when switching repos
      focusedBranch.value = null;
      clearSelection();
      // Stale-while-revalidate: paint cached worktrees instantly for previously
      // loaded repos (no skeleton flash); blank + show loading for uncached repos.
      if (isRepoLoaded(name)) {
        worktrees.value = getCachedWorktrees(name);
        loadingWorktrees.value = false;
      } else {
        worktrees.value = [];
        loadingWorktrees.value = true;
      }
      // Persist selection
      appStore.setLastSelectedRepo(name);
    }
  }

  /**
   * Deselect the current repository — the dashboard shows the overview.
   */
  function deselectRepository() {
    selectedRepoName.value = null;
    focusedBranch.value = null;
    focusTransient.value = false;
    clearSelection();
    // Persist so future launches also land on the overview
    appStore.setLastSelectedRepo(null);
  }

  function focusWorktree(branch: string, shouldExpandDetails = false, transient = false) {
    focusedBranch.value = branch;
    expandOnFocus.value = shouldExpandDetails;
    focusTransient.value = transient;
  }

  function clearFocusedWorktree() {
    focusedBranch.value = null;
    // Don't clear expandOnFocus here - let it persist so cards can use it when they render
    // It will be cleared separately after the card has had a chance to expand
  }

  function clearExpandOnFocus() {
    expandOnFocus.value = false;
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
    focusTransient.value = false;
    clearSelection();
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
    expandOnFocus,
    focusTransient,
    selectedPaths,
    lastSelectedPath,
    // Getters
    selectedRepo,
    hasRepositories,
    totalWorktrees,
    dirtyWorktrees,
    cleanWorktrees,
    selectionCount,
    // Actions
    setRepositories,
    setWorktrees,
    setRecentWorktrees,
    selectRepository,
    deselectRepository,
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
    clearExpandOnFocus,
    toggleSelection,
    setSelection,
    clearSelection,
    selectRange,
    // Lazy loading
    loadedRepos,
    isRepoLoaded,
    getCachedWorktrees,
  };
});
