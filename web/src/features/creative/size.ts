const SIZE_PATTERN = /^\s*(\d+)\s*[xX×]\s*(\d+)\s*$/
const RATIO_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*[:xX×]\s*(\d+(?:\.\d+)?)\s*$/
const SIZE_MULTIPLE = 16
const MAX_EDGE = 3840
const MAX_ASPECT_RATIO = 3
const MIN_PIXELS = 655_360
const MAX_PIXELS = 8_294_400
const MAX_1K_PIXELS = 1_572_864

export type SizeTier = '1K' | '2K' | '4K'
export type PresetRatio =
  | '1:1'
  | '3:2'
  | '2:3'
  | '16:9'
  | '9:16'
  | '4:3'
  | '3:4'
  | '21:9'

function roundToMultiple(value: number) {
  return Math.max(
    SIZE_MULTIPLE,
    Math.round(value / SIZE_MULTIPLE) * SIZE_MULTIPLE
  )
}

function floorToMultiple(value: number) {
  return Math.max(
    SIZE_MULTIPLE,
    Math.floor(value / SIZE_MULTIPLE) * SIZE_MULTIPLE
  )
}

function ceilToMultiple(value: number) {
  return Math.max(
    SIZE_MULTIPLE,
    Math.ceil(value / SIZE_MULTIPLE) * SIZE_MULTIPLE
  )
}

function normalizeDimensions(width: number, height: number) {
  let normalizedWidth = roundToMultiple(width)
  let normalizedHeight = roundToMultiple(height)
  const scaleToFit = (scale: number) => {
    normalizedWidth = floorToMultiple(normalizedWidth * scale)
    normalizedHeight = floorToMultiple(normalizedHeight * scale)
  }
  const scaleToFill = (scale: number) => {
    normalizedWidth = ceilToMultiple(normalizedWidth * scale)
    normalizedHeight = ceilToMultiple(normalizedHeight * scale)
  }
  for (let index = 0; index < 4; index += 1) {
    const maxEdge = Math.max(normalizedWidth, normalizedHeight)
    if (maxEdge > MAX_EDGE) scaleToFit(MAX_EDGE / maxEdge)
    if (normalizedWidth / normalizedHeight > MAX_ASPECT_RATIO) {
      normalizedWidth = floorToMultiple(normalizedHeight * MAX_ASPECT_RATIO)
    } else if (normalizedHeight / normalizedWidth > MAX_ASPECT_RATIO) {
      normalizedHeight = floorToMultiple(normalizedWidth * MAX_ASPECT_RATIO)
    }
    const pixels = normalizedWidth * normalizedHeight
    if (pixels > MAX_PIXELS) scaleToFit(Math.sqrt(MAX_PIXELS / pixels))
    else if (pixels < MIN_PIXELS) scaleToFill(Math.sqrt(MIN_PIXELS / pixels))
  }
  return { width: normalizedWidth, height: normalizedHeight }
}

export function normalizeImageSize(size: string) {
  const match = size.trim().match(SIZE_PATTERN)
  if (!match) return size.trim()
  const normalized = normalizeDimensions(Number(match[1]), Number(match[2]))
  return `${normalized.width}x${normalized.height}`
}

export function parseRatio(ratio: string) {
  const match = ratio.match(RATIO_PATTERN)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }
  return { width, height }
}

const TIER_PIXEL_BUDGET: Record<SizeTier, number> = {
  '1K': MAX_1K_PIXELS,
  '2K': 4_194_304,
  '4K': MAX_PIXELS,
}

const COMMON_SIZE_PRESETS: Record<SizeTier, Record<PresetRatio, string>> = {
  '1K': {
    '1:1': '1024x1024',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
    '16:9': '1280x720',
    '9:16': '720x1280',
    '4:3': '1024x768',
    '3:4': '768x1024',
    '21:9': '1280x544',
  },
  '2K': {
    '1:1': '2048x2048',
    '3:2': '2160x1440',
    '2:3': '1440x2160',
    '16:9': '2560x1440',
    '9:16': '1440x2560',
    '4:3': '2048x1536',
    '3:4': '1536x2048',
    '21:9': '2560x1088',
  },
  '4K': {
    '1:1': '2880x2880',
    '3:2': '3456x2304',
    '2:3': '2304x3456',
    '16:9': '3840x2160',
    '9:16': '2160x3840',
    '4:3': '3200x2400',
    '3:4': '2400x3200',
    '21:9': '3840x1600',
  },
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function presetRatio(width: number, height: number): PresetRatio | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return null
  }
  const divisor = gcd(width, height)
  const key = `${width / divisor}:${height / divisor}`
  return key in COMMON_SIZE_PRESETS['1K'] ? (key as PresetRatio) : null
}

export function calculateImageSize(tier: SizeTier, ratio: string) {
  const parsed = parseRatio(ratio)
  if (!parsed) {
    return null
  }
  const knownRatio = presetRatio(parsed.width, parsed.height)
  if (knownRatio) return COMMON_SIZE_PRESETS[tier][knownRatio]
  const targetRatio = parsed.width / parsed.height
  const pixelBudget = TIER_PIXEL_BUDGET[tier]
  let bestWidth = 0
  let bestHeight = 0
  let bestPixels = 0
  for (let width = SIZE_MULTIPLE; width <= MAX_EDGE; width += SIZE_MULTIPLE) {
    const idealHeight = width / targetRatio
    const heights = [
      Math.floor(idealHeight / SIZE_MULTIPLE) * SIZE_MULTIPLE,
      Math.ceil(idealHeight / SIZE_MULTIPLE) * SIZE_MULTIPLE,
    ]
    for (const height of heights) {
      if (height < SIZE_MULTIPLE || height > MAX_EDGE) continue
      const pixels = width * height
      if (pixels > pixelBudget || pixels < MIN_PIXELS) continue
      if (Math.max(width / height, height / width) > MAX_ASPECT_RATIO) continue
      if (Math.abs(width / height - targetRatio) / targetRatio > 0.01) continue
      if (pixels > bestPixels) {
        bestPixels = pixels
        bestWidth = width
        bestHeight = height
      }
    }
  }
  return bestPixels ? `${bestWidth}x${bestHeight}` : null
}

export function findPresetForSize(size: string) {
  const normalized = normalizeImageSize(size)
  const tiers: SizeTier[] = ['1K', '2K', '4K']
  const ratios: PresetRatio[] = [
    '1:1',
    '3:2',
    '2:3',
    '16:9',
    '9:16',
    '4:3',
    '3:4',
    '21:9',
  ]
  for (const tier of tiers) {
    for (const ratio of ratios) {
      if (calculateImageSize(tier, ratio) === normalized) {
        return { tier, ratio }
      }
    }
  }
  return null
}

export function parseSize(size: string) {
  const match = size.match(/^\s*(\d+)\s*[xX×]\s*(\d+)\s*$/)
  return match ? { width: match[1], height: match[2] } : null
}
