import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useServicesStore } from './services';
import type { ServiceApp, ServicesStatusResult } from '../types';

function makeApp(overrides: Partial<ServiceApp> = {}): ServiceApp {
  return {
    name: 'myapp',
    system_name: 'myapp',
    services: 'horizon',
    supervisor_process: 'myapp-horizon',
    domain: 'myapp.test',
    current_worktree: 'main',
    supervisor_status: 'RUNNING',
    scheduler_loaded: true,
    ...overrides,
  };
}

describe('useServicesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts empty with daemons not running', () => {
    const store = useServicesStore();
    expect(store.apps).toEqual([]);
    expect(store.hasApps).toBe(false);
    expect(store.supervisorRunning).toBe(false);
    expect(store.redisRunning).toBe(false);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('setStatus populates daemons and apps', () => {
    const store = useServicesStore();
    const result: ServicesStatusResult = {
      supervisor_running: true,
      redis_running: true,
      apps: [makeApp(), makeApp({ name: 'other', supervisor_status: 'FATAL' })],
    };
    store.setStatus(result);
    expect(store.supervisorRunning).toBe(true);
    expect(store.redisRunning).toBe(true);
    expect(store.apps).toHaveLength(2);
    expect(store.hasApps).toBe(true);
  });

  it('counts running and stopped apps', () => {
    const store = useServicesStore();
    store.setStatus({
      supervisor_running: true,
      redis_running: true,
      apps: [
        makeApp({ name: 'a', supervisor_status: 'RUNNING' }),
        makeApp({ name: 'b', supervisor_status: 'FATAL' }),
        makeApp({ name: 'c', supervisor_status: 'STOPPED' }),
        // services=none apps have no worker and count as neither
        makeApp({ name: 'd', services: 'none', supervisor_status: null }),
      ],
    });
    expect(store.runningCount).toBe(1);
    expect(store.stoppedCount).toBe(2);
  });

  it('tracks pending actions per app', () => {
    const store = useServicesStore();
    expect(store.isActionPending('myapp')).toBe(false);
    store.setActionPending('myapp', true);
    expect(store.isActionPending('myapp')).toBe(true);
    expect(store.isActionPending('other')).toBe(false);
    store.setActionPending('myapp', false);
    expect(store.isActionPending('myapp')).toBe(false);
  });

  it('reset clears all state', () => {
    const store = useServicesStore();
    store.setStatus({
      supervisor_running: true,
      redis_running: true,
      apps: [makeApp()],
    });
    store.setActionPending('myapp', true);
    store.setError({ code: 'COMMAND_FAILED', message: 'boom' });
    store.reset();
    expect(store.apps).toEqual([]);
    expect(store.supervisorRunning).toBe(false);
    expect(store.redisRunning).toBe(false);
    expect(store.error).toBeNull();
    expect(store.isActionPending('myapp')).toBe(false);
  });
});
