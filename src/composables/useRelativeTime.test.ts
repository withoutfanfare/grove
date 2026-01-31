import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatRelativeTime, useRelativeTime } from './useRelativeTime'
import { ref } from 'vue'

describe('formatRelativeTime', () => {
  const mockDate = new Date('2026-01-31T14:00:00Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(mockDate)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('edge cases', () => {
    it('should handle undefined timestamp', () => {
      const result = formatRelativeTime(undefined)
      expect(result.short).toBe('unknown')
      expect(result.full).toBe('unknown')
      expect(result.isJustNow).toBe(false)
    })

    it('should handle null timestamp', () => {
      const result = formatRelativeTime(null)
      expect(result.short).toBe('unknown')
      expect(result.full).toBe('unknown')
    })

    it('should handle empty string', () => {
      const result = formatRelativeTime('')
      expect(result.short).toBe('unknown')
      expect(result.full).toBe('unknown')
    })

    it('should handle invalid timestamp', () => {
      const result = formatRelativeTime('invalid')
      // Invalid date results in NaN secondsAgo which is < 60, so it returns 'now'
      expect(result.short).toBe('now')
    })
  })

  describe('just now', () => {
    it('should return "just now" for timestamps < 60 seconds ago', () => {
      const timestamp = '2026-01-31T13:59:30Z' // 30 seconds ago
      const result = formatRelativeTime(timestamp)
      expect(result.short).toBe('now')
      expect(result.full).toBe('just now')
      expect(result.isJustNow).toBe(true)
      expect(result.secondsAgo).toBe(30)
    })

    it('should return "just now" for timestamps 59 seconds ago', () => {
      const timestamp = '2026-01-31T13:59:01Z'
      const result = formatRelativeTime(timestamp)
      expect(result.short).toBe('now')
      expect(result.full).toBe('just now')
    })
  })

  describe('minutes', () => {
    it('should format single minute', () => {
      const timestamp = '2026-01-31T13:59:00Z' // 1 minute ago
      const result = formatRelativeTime(timestamp)
      expect(result.short).toBe('1m ago')
      expect(result.full).toBe('1 minute ago')
    })

    it('should format multiple minutes', () => {
      const timestamp = '2026-01-31T13:55:00Z' // 5 minutes ago
      const result = formatRelativeTime(timestamp)
      expect(result.short).toBe('5m ago')
      expect(result.full).toBe('5 minutes ago')
    })

    it('should format 59 minutes', () => {
      const timestamp = '2026-01-31T13:01:00Z'
      const result = formatRelativeTime(timestamp)
      expect(result.short).toBe('59m ago')
      expect(result.full).toBe('59 minutes ago')
    })
  })

  describe('hours', () => {
    it('should format single hour', () => {
      const timestamp = '2026-01-31T13:00:00Z'
      const result = formatRelativeTime(timestamp)
      expect(result.short).toBe('1h ago')
      expect(result.full).toBe('1 hour ago')
    })

    it('should format multiple hours', () => {
      const timestamp = '2026-01-31T10:00:00Z'
      const result = formatRelativeTime(timestamp)
      expect(result.short).toBe('4h ago')
      expect(result.full).toBe('4 hours ago')
    })

    it('should format 23 hours', () => {
      const timestamp = '2026-01-30T15:00:00Z'
      const result = formatRelativeTime(timestamp)
      expect(result.short).toBe('23h ago')
      expect(result.full).toBe('23 hours ago')
    })
  })

  describe('days', () => {
    it('should format single day', () => {
      const timestamp = '2026-01-30T14:00:00Z'
      const result = formatRelativeTime(timestamp)
      expect(result.short).toBe('1d ago')
      expect(result.full).toBe('1 day ago')
    })

    it('should format multiple days', () => {
      const timestamp = '2026-01-28T14:00:00Z'
      const result = formatRelativeTime(timestamp)
      expect(result.short).toBe('3d ago')
      expect(result.full).toBe('3 days ago')
    })

    it('should format 6 days', () => {
      const timestamp = '2026-01-25T14:00:00Z'
      const result = formatRelativeTime(timestamp)
      expect(result.short).toBe('6d ago')
      expect(result.full).toBe('6 days ago')
    })
  })

  describe('weeks', () => {
    it('should format single week', () => {
      const timestamp = '2026-01-24T14:00:00Z'
      const result = formatRelativeTime(timestamp)
      expect(result.short).toBe('1w ago')
      expect(result.full).toBe('1 week ago')
    })

    it('should format multiple weeks', () => {
      const timestamp = '2026-01-17T14:00:00Z'
      const result = formatRelativeTime(timestamp)
      expect(result.short).toBe('2w ago')
      expect(result.full).toBe('2 weeks ago')
    })

    it('should format 3 weeks', () => {
      const timestamp = '2026-01-10T14:00:00Z'
      const result = formatRelativeTime(timestamp)
      expect(result.short).toBe('3w ago')
      expect(result.full).toBe('3 weeks ago')
    })
  })

  describe('months', () => {
    it('should format single month', () => {
      const timestamp = '2025-12-31T14:00:00Z'
      const result = formatRelativeTime(timestamp)
      expect(result.short).toBe('1mo ago')
      expect(result.full).toBe('1 month ago')
    })

    it('should format multiple months', () => {
      const timestamp = '2025-10-31T14:00:00Z'
      const result = formatRelativeTime(timestamp)
      expect(result.short).toBe('3mo ago')
      expect(result.full).toBe('3 months ago')
    })

    it('should format 11 months', () => {
      const timestamp = '2025-02-28T14:00:00Z'
      const result = formatRelativeTime(timestamp)
      expect(result.short).toBe('11mo ago')
      expect(result.full).toBe('11 months ago')
    })
  })

  describe('years', () => {
    it('should format single year', () => {
      const timestamp = '2025-01-31T14:00:00Z'
      const result = formatRelativeTime(timestamp)
      expect(result.short).toBe('1y ago')
      expect(result.full).toBe('1 year ago')
    })

    it('should format multiple years', () => {
      const timestamp = '2024-01-31T14:00:00Z'
      const result = formatRelativeTime(timestamp)
      // From Jan 31, 2024 to Jan 31, 2026 is 2 years
      expect(result.short).toBe('2y ago')
      expect(result.full).toBe('2 years ago')
    })
  })

  describe('secondsAgo', () => {
    it('should calculate correct seconds', () => {
      const timestamp = '2026-01-31T13:00:00Z' // 1 hour = 3600 seconds
      const result = formatRelativeTime(timestamp)
      expect(result.secondsAgo).toBe(3600)
    })

    it('should calculate correct seconds for days', () => {
      const timestamp = '2026-01-30T14:00:00Z' // 1 day = 86400 seconds
      const result = formatRelativeTime(timestamp)
      expect(result.secondsAgo).toBe(86400)
    })
  })
})

describe('useRelativeTime', () => {
  const mockDate = new Date('2026-01-31T14:00:00Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(mockDate)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return computed relative time', () => {
    const timestamp = ref('2026-01-31T13:00:00Z')
    const { relativeTime } = useRelativeTime(() => timestamp.value)
    
    expect(relativeTime.value.short).toBe('1h ago')
    expect(relativeTime.value.full).toBe('1 hour ago')
  })

  it('should react to timestamp changes', () => {
    const timestamp = ref('2026-01-31T13:00:00Z')
    const { relativeTime } = useRelativeTime(() => timestamp.value)
    
    expect(relativeTime.value.short).toBe('1h ago')
    
    timestamp.value = '2026-01-31T12:00:00Z'
    expect(relativeTime.value.short).toBe('2h ago')
  })

  it('should handle undefined timestamp reactively', () => {
    const timestamp = ref<string | undefined>('2026-01-31T13:00:00Z')
    const { relativeTime } = useRelativeTime(() => timestamp.value)
    
    expect(relativeTime.value.short).toBe('1h ago')
    
    timestamp.value = undefined
    expect(relativeTime.value.short).toBe('unknown')
  })
})
