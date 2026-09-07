import { api } from '@/lib/api'

import { DEFAULT_PARAMS, type TaskParams, type TaskRecord } from '../types'

export interface CreativeStorageConfig {
  enabled: boolean
  endpoint: string
  bucket: string
  region: string
  prefix: string
  path_style: boolean
  access_key_configured: boolean
  secret_key_configured: boolean
}

export interface CreativeStorageInput {
  enabled: boolean
  endpoint: string
  bucket: string
  region: string
  prefix: string
  path_style: boolean
  access_key: string
  secret_key: string
}

export interface CreativeGenerationAsset {
  id: number
  asset_key: string
  content_url: string
  mime_type: string
  byte_size: number
  width: number
  height: number
  duration_ms: number
}

export interface CreativeGenerationRecord {
  id: number
  client_task_id: string
  token_id: number
  provider_task_id: string
  media_type: 'image' | 'video'
  model: string
  group: string
  prompt: string
  request_params: string
  status: 'processing' | 'completed' | 'failed'
  elapsed_ms: number
  error_message: string
  created_at: number
  finished_at: number
  assets: CreativeGenerationAsset[]
}

export async function getCreativeStorageConfig(): Promise<CreativeStorageConfig> {
  const response = await api.get('/api/creative/storage')
  return response.data.data as CreativeStorageConfig
}

export async function updateCreativeStorageConfig(
  input: CreativeStorageInput
): Promise<void> {
  await api.put('/api/creative/storage', input)
}

export async function testCreativeStorageConfig(
  input: CreativeStorageInput
): Promise<void> {
  await api.post('/api/creative/storage/test', input)
}

export async function listCreativeImageGenerations(): Promise<
  CreativeGenerationRecord[]
> {
  const response = await api.get('/api/creative/generations', {
    params: { media_type: 'image', limit: 100 },
    skipErrorHandler: true,
  })
  return Array.isArray(response.data?.data) ? response.data.data : []
}

export async function deleteCreativeGenerationByClientTaskId(
  clientTaskId: string
): Promise<void> {
  try {
    await api.delete(
      `/api/creative/generations/client/${encodeURIComponent(clientTaskId)}`,
      { skipErrorHandler: true }
    )
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      (error as { response?: { status?: number } }).response?.status === 404
    ) {
      return
    }
    throw error
  }
}

function parseTaskParams(value: string): TaskParams {
  let candidate: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === 'object') {
      candidate = parsed as Record<string, unknown>
    }
  } catch {
    return { ...DEFAULT_PARAMS }
  }

  const params = { ...DEFAULT_PARAMS }
  if (typeof candidate.size === 'string' && candidate.size.trim()) {
    params.size = candidate.size
  }
  if (
    candidate.quality === 'auto' ||
    candidate.quality === 'low' ||
    candidate.quality === 'medium' ||
    candidate.quality === 'high'
  ) {
    params.quality = candidate.quality
  }
  if (
    candidate.output_format === 'png' ||
    candidate.output_format === 'jpeg' ||
    candidate.output_format === 'webp'
  ) {
    params.output_format = candidate.output_format
  }
  if (
    typeof candidate.output_compression === 'number' &&
    Number.isFinite(candidate.output_compression)
  ) {
    params.output_compression = candidate.output_compression
  }
  if (typeof candidate.n === 'number' && candidate.n > 0) {
    params.n = Math.floor(candidate.n)
  }
  return params
}

export function creativeGenerationToTask(
  generation: CreativeGenerationRecord,
  sourceName: string
): TaskRecord {
  const outputImages = generation.assets
    .map((asset) => asset.content_url.trim())
    .filter(Boolean)
  const params = parseTaskParams(generation.request_params)
  params.n = outputImages.length || params.n
  const createdAt = generation.created_at * 1000
  const finishedAt = generation.finished_at
    ? generation.finished_at * 1000
    : null
  const status = generation.status === 'completed' ? 'done' : 'error'
  const actualParamsByImage: Record<string, Partial<TaskParams>> = {}
  generation.assets.forEach((asset) => {
    const imageURL = asset.content_url.trim()
    if (imageURL && asset.width > 0 && asset.height > 0) {
      actualParamsByImage[imageURL] = {
        size: `${asset.width}x${asset.height}`,
      }
    }
  })

  return {
    id: generation.client_task_id,
    prompt: generation.prompt,
    params,
    apiProvider: 'openai',
    apiProfileId: 'newapi',
    apiProfileName: sourceName,
    apiMode: 'images',
    apiModel: generation.model,
    newApiKeyId: generation.token_id || undefined,
    newApiGroup: generation.group,
    actualParams: { size: params.size, n: outputImages.length || params.n },
    actualParamsByImage:
      Object.keys(actualParamsByImage).length > 0
        ? actualParamsByImage
        : undefined,
    inputImageIds: [],
    outputImages,
    rawImageUrls: generation.assets.map((asset) => asset.content_url),
    status,
    error:
      generation.status === 'failed' ? generation.error_message || null : null,
    createdAt,
    finishedAt,
    elapsed: generation.elapsed_ms || null,
    sourceMode: 'gallery',
  }
}
