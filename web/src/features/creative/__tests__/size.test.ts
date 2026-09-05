import { describe, expect, it } from 'vitest'

import { calculateImageSize, normalizeImageSize, parseRatio } from '../size'

describe('创作中心尺寸选择', () => {
  it('将不符合约束的自定义尺寸规整为 16 倍数', () => {
    expect(normalizeImageSize('1000x1000')).toBe('1008x1008')
  })

  it('按参考项目的档位和比例返回常用分辨率', () => {
    expect(calculateImageSize('1K', '16:9')).toBe('1280x720')
    expect(calculateImageSize('2K', '1:1')).toBe('2048x2048')
  })

  it('拒绝无效比例', () => {
    expect(parseRatio('0:1')).toBeNull()
    expect(calculateImageSize('1K', 'invalid')).toBeNull()
  })
})
