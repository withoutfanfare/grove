import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ServiceApp, ServicesStatusResult, WtError } from '../types';

export const useServicesStore = defineStore('services', () => {
  // State
  const supervisorRunning = ref(false);
  const redisRunning = ref(false);
  const apps = ref<ServiceApp[]>([]);
  const loading = ref(false);
  const error = ref<WtError | null>(null);
  // App names with an in-flight start/stop/restart action
  const pendingActions = ref<Set<string>>(new Set());

  // Getters
  const hasApps = computed(() => apps.value.length > 0);

  const runningCount = computed(
    () => apps.value.filter((a) => a.supervisor_status === 'RUNNING').length
  );

  const stoppedCount = computed(
    () =>
      apps.value.filter(
        (a) => a.supervisor_status != null && a.supervisor_status !== 'RUNNING'
      ).length
  );

  // Actions
  function setStatus(result: ServicesStatusResult) {
    supervisorRunning.value = result.supervisor_running;
    redisRunning.value = result.redis_running;
    apps.value = result.apps;
  }

  function setLoading(isLoading: boolean) {
    loading.value = isLoading;
  }

  function setError(err: WtError | null) {
    error.value = err;
  }

  function clearError() {
    error.value = null;
  }

  function setActionPending(appName: string, pending: boolean) {
    const next = new Set(pendingActions.value);
    if (pending) {
      next.add(appName);
    } else {
      next.delete(appName);
    }
    pendingActions.value = next;
  }

  function isActionPending(appName: string): boolean {
    return pendingActions.value.has(appName);
  }

  function reset() {
    supervisorRunning.value = false;
    redisRunning.value = false;
    apps.value = [];
    loading.value = false;
    error.value = null;
    pendingActions.value = new Set();
  }

  return {
    // State
    supervisorRunning,
    redisRunning,
    apps,
    loading,
    error,
    pendingActions,
    // Getters
    hasApps,
    runningCount,
    stoppedCount,
    // Actions
    setStatus,
    setLoading,
    setError,
    clearError,
    setActionPending,
    isActionPending,
    reset,
  };
});
