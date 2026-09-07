import { describe, expect, it } from 'vitest'

import { formatByteSize, formatElapsedDuration } from '../mediaMetadata'

const units = { hour: '小时', minute: '分', second: '秒' }

describe('media metadata formatting', () => {
  it('formats seconds and minutes without a label', () => {
    expect(formatElapsedDuration(5, units)).toBe('05秒')
    expect(formatElapsedDuration(65, units)).toBe('1分05秒')
  })

  it('formats image byte sizes with readable units', () => {
    expect(formatByteSize(850)).toBe('850 B')
    expect(formatByteSize(1.9 * 1024 * 1024)).toBe('1.9 MB')
  })
})
