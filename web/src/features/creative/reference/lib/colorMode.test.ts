import { describe, expect, it } from 'vitest'

import type { ColorMode } from '../types'
import { resolveDarkMode } from './colorMode'

describe('color mode', () => {
  it.each<[ColorMode, boolean]>([
    ['system', false],
    ['system', true],
    ['light', false],
    ['light', true],
    ['dark', false],
    ['dark', true],
  ])(
    'resolves %s mode when system dark is %s',
    (mode, systemDark) => {
      expect(resolveDarkMode(mode, systemDark)).toBe(
        mode === 'dark' || (mode === 'system' && systemDark)
      )
    }
  )
})
