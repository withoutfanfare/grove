import { config } from '@vue/test-utils'

// Configure Vue Test Utils
config.global.stubs = {
  // Stub teleport target for modals/dropdowns
  teleport: true,
}

// Mock Tauri API
const mockTauriInvoke = vi.fn()
const mockTauriListen = vi.fn()
const mockTauriEmit = vi.fn()

// Mock @tauri-apps/api
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockTauriInvoke,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockTauriListen,
  emit: mockTauriEmit,
}))

// Mock @tauri-apps/plugin-shell
vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(),
}))

// Mock @tauri-apps/plugin-clipboard-manager
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn(),
  readText: vi.fn(),
}))

// Mock @tauri-apps/plugin-opener
vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: vi.fn(),
  openUrl: vi.fn(),
}))

// Export mock functions for test access
export { mockTauriInvoke, mockTauriListen, mockTauriEmit }

// Helper to reset mocks between tests
export function resetTauriMocks() {
  mockTauriInvoke.mockClear()
  mockTauriListen.mockClear()
  mockTauriEmit.mockClear()
}

// Global test utilities
declare global {
  function expectTauriInvoke(command: string, ...args: any[]): ReturnType<typeof expect>
}

// Extend expect with custom matchers
expect.extend({
  toHaveBeenInvokedWith(received: typeof mockTauriInvoke, command: string, args?: any) {
    const calls = received.mock.calls
    const matchingCall = calls.find(call => call[0] === command)
    
    if (!matchingCall) {
      return {
        message: () => `expected invoke to have been called with command "${command}"`,
        pass: false,
      }
    }
    
    if (args !== undefined) {
      const passed = this.equals(matchingCall[1], args)
      return {
        message: () => 
          passed 
            ? `expected invoke not to have been called with ${this.printExpected(args)}`
            : `expected invoke to have been called with ${this.printExpected(args)}, but got ${this.printReceived(matchingCall[1])}`,
        pass: passed,
      }
    }
    
    return {
      message: () => `expected invoke not to have been called with command "${command}"`,
      pass: true,
    }
  },
})

// Reset mocks before each test
beforeEach(() => {
  resetTauriMocks()
})
