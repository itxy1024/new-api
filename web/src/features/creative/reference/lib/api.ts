import { api } from '@/lib/api'

import { getActiveApiProfile, getCustomProviderDefinition } from './apiProfiles'
import { callFalAiImageApi } from './falAiImageApi'
import {
  type CallApiOptions,
  type CallApiResult,
  fetchImageUrlAsDataUrl,
  isDataUrl,
  isHttpUrl,
  MIME_MAP,
} from './imageApiShared'
import { getNewApiSelection } from './newApiSelection'
import { callOpenAICompatibleImageApi } from './openaiCompatibleImageApi'

export type { CallApiOptions, CallApiResult } from './imageApiShared'
export { normalizeBaseUrl } from './devProxy'

function isNewApiProfile(
  profile: ReturnType<typeof getActiveApiProfile>
): boolean {
  return profile.id === 'newapi' || profile.baseUrl.trim() === '/api/creative'
}

function getImageItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (!raw || typeof raw !== 'object') return []
  const data = (raw as { data?: unknown }).data
  return Array.isArray(data) ? data : []
}

/** 将服务端返回的相对图片地址解析为当前 NewAPI 地址。 */
function resolveImageUrl(value: string): string {
  const normalized = value.trim()
  if (!normalized) return ''
  if (isHttpUrl(normalized)) return normalized
  if (typeof window === 'undefined') return normalized
  try {
    return new URL(normalized, window.location.origin).toString()
  } catch {
    return normalized
  }
}

async function callNewApiImageApi(
  opts: CallApiOptions,
  profile: ReturnType<typeof getActiveApiProfile>
): Promise<CallApiResult> {
  const selection = opts.newApiSelection ?? getNewApiSelection()
  // NewAPI 请求必须使用当前选择器快照，不能沿用参考项目设置中可能过期的
  // apiKey/model，更不能因为快照缺失而回退到默认配置或默认分组。
  if (!selection) throw new Error('请选择 API Key 和模型')
  const keyId = selection.keyId
  const model = selection.model
  const group = selection.group
  if (!Number.isInteger(keyId) || keyId <= 0) {
    throw new Error('请选择可用的 API Key')
  }
  if (!model.trim()) {
    throw new Error('请选择模型')
  }

  const params: Record<string, unknown> = {
    key_id: keyId,
    model,
    // 始终显式传递 group；空字符串表示使用当前 Key 的唯一分组，
    // 不让请求体缺字段而触发中间层的默认分组回退。
    group,
    prompt: opts.prompt,
    size: opts.params.size,
    quality: opts.params.quality,
    output_format: opts.params.output_format,
    moderation: opts.params.moderation,
    n: opts.params.n,
    // NewAPI 的创作接口沿用旧页面的短模式值；该字段不会作为厂商密钥或地址暴露给浏览器。
    interface_mode: profile.apiMode === 'responses' ? 'resp' : 'img',
  }
  if (
    opts.params.output_format !== 'png' &&
    opts.params.output_compression != null
  ) {
    params.output_compression = opts.params.output_compression
  }
  if (opts.nativeTransparentBackground) params.background = 'transparent'
  if (opts.inputImageDataUrls.length) params.images = opts.inputImageDataUrls
  if (opts.maskDataUrl) params.mask = opts.maskDataUrl

  const response = await api.post('/api/creative/images', params)
  const raw = response.data?.data
  const items = getImageItems(raw)
  const mime = MIME_MAP[opts.params.output_format] || 'image/png'
  const images: string[] = []
  const revisedPrompts: Array<string | undefined> = []
  const rawImageUrls: string[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const value = item as {
      url?: unknown
      b64_json?: unknown
      revised_prompt?: unknown
    }
    let source = ''
    if (typeof value.b64_json === 'string' && value.b64_json.trim()) {
      source = `data:${mime};base64,${value.b64_json}`
    } else if (typeof value.url === 'string' && value.url.trim()) {
      source = resolveImageUrl(value.url)
      rawImageUrls.push(value.url)
    }
    if (!source) continue
    let image = ''
    if (isDataUrl(source)) {
      image = source
    } else if (isHttpUrl(source)) {
      image = await fetchImageUrlAsDataUrl(source, mime)
    }
    if (!image) continue
    images.push(image)
    revisedPrompts.push(
      typeof value.revised_prompt === 'string'
        ? value.revised_prompt
        : undefined
    )
  }
  if (!images.length) throw new Error('接口未返回图片数据')
  return {
    images,
    revisedPrompts,
    rawImageUrls: rawImageUrls.length ? rawImageUrls : undefined,
  }
}

export async function callImageApi(
  opts: CallApiOptions
): Promise<CallApiResult> {
  const profile = getActiveApiProfile(opts.settings)
  if (isNewApiProfile(profile)) return callNewApiImageApi(opts, profile)
  if (profile.provider === 'fal') return callFalAiImageApi(opts, profile)

  return callOpenAICompatibleImageApi(
    opts,
    profile,
    getCustomProviderDefinition(opts.settings, profile.provider)
  )
}
